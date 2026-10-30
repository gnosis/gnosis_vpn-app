//! Decides, before the webview starts, whether GPU compositing and full-rate animation are affordable.

use serde::Serialize;
use std::sync::OnceLock;

#[cfg(target_os = "linux")]
mod blocklist;
#[cfg(target_os = "linux")]
mod egl;
#[cfg(target_os = "linux")]
mod gpu_info;

/// Hidden argv[1] that turns the binary into the GPU probe child.
pub const PROBE_ARG: &str = "--gpu-probe";

/// What the webview can afford to render, fixed for the process lifetime.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderProfile {
    /// No GL verifiably faster than the CPU: compositing is off and animations run lean.
    pub software_rendering: bool,
    /// CPUs this process may use, affinity and cgroup quotas included.
    pub cpu_cores: usize,
    /// Why `software_rendering` was chosen, for the log.
    #[serde(skip)]
    pub reason: String,
}

static PROFILE: OnceLock<RenderProfile> = OnceLock::new();

/// Probes on first call and remembers the result; call before GTK/WebKit start.
pub fn init() -> &'static RenderProfile {
    PROFILE.get_or_init(detect)
}

#[tauri::command]
pub fn get_render_profile() -> RenderProfile {
    init().clone()
}

fn cpu_cores() -> usize {
    std::thread::available_parallelism().map_or(1, |n| n.get())
}

#[cfg(not(target_os = "linux"))]
fn detect() -> RenderProfile {
    // WKWebView and WebView2 vet their GPU path themselves.
    RenderProfile {
        software_rendering: false,
        cpu_cores: cpu_cores(),
        reason: "platform webview decides".to_string(),
    }
}

/// Runs the GPU probe in this process and returns its exit code; only the probe child calls this.
#[cfg(target_os = "linux")]
pub fn run_probe() -> i32 {
    match egl::probe() {
        Ok(report) => {
            println!("{report}");
            0
        }
        Err(e) => {
            println!("error={e}");
            1
        }
    }
}

#[cfg(target_os = "linux")]
const PROBE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);

/// Renderer names of CPU rasterizers, also when wrapped (e.g. "virgl (LLVMPIPE …)").
#[cfg(target_os = "linux")]
const SOFTWARE_RENDERER_MARKERS: [&str; 7] = [
    "llvmpipe",
    "softpipe",
    "swrast",
    "lavapipe",
    "swiftshader",
    "software",
    "basic render",
];

/// Measured: VMware SVGA3D ~0.2 ms, llvmpipe ~7 ms on 8 cores and ~38 ms on one, softpipe ~225 ms.
#[cfg(target_os = "linux")]
const MAX_HARDWARE_DRAW_MS: f64 = 4.0;

#[cfg(target_os = "linux")]
fn detect() -> RenderProfile {
    // Anything short of a probe that renders, fast, on a GPU Chrome would trust counts as software.
    let (software_rendering, reason) = match probe_in_child() {
        Ok(output) => classify(&output, gpu_info::pci_gpus(), &gpu_info::os_release()),
        Err(e) => (true, format!("probe failed: {e}")),
    };
    RenderProfile {
        software_rendering,
        cpu_cores: cpu_cores(),
        reason,
    }
}

/// A child process, so a crashing or hanging GL driver can't take the app down.
#[cfg(target_os = "linux")]
fn probe_in_child() -> Result<String, String> {
    use std::io::Read;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    let exe = std::env::current_exe().map_err(|e| format!("current exe: {e}"))?;
    let mut child = Command::new(exe)
        .arg(PROBE_ARG)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("spawn: {e}"))?;
    let deadline = Instant::now() + PROBE_TIMEOUT;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| format!("wait: {e}"))? {
            break status;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("timed out after {PROBE_TIMEOUT:?}"));
        }
        std::thread::sleep(Duration::from_millis(10));
    };
    let mut output = String::new();
    if let Some(mut stdout) = child.stdout.take() {
        let _ = stdout.read_to_string(&mut output);
    }
    if status.success() {
        Ok(output)
    } else {
        Err(format!("{status}: {}", output.trim()))
    }
}

/// `(software_rendering, reason)` from the probe child's `key=value` report: Chrome's blocklist rules first, then
/// the renderer must name a GPU that draws fast.
#[cfg(target_os = "linux")]
fn classify(output: &str, gpus: Vec<gpu_info::GpuDevice>, os_release: &str) -> (bool, String) {
    let field = |key: &str| {
        output
            .lines()
            .find_map(|line| line.strip_prefix(key)?.strip_prefix('='))
    };
    let Some(renderer) = field("renderer").filter(|r| !r.trim().is_empty()) else {
        return (true, format!("no renderer reported: {:?}", output.trim()));
    };
    let gl = gpu_info::GlStrings {
        vendor: field("vendor").unwrap_or_default().to_string(),
        renderer: renderer.to_string(),
        version: field("version").unwrap_or_default().to_string(),
        extensions: field("extensions").unwrap_or_default().to_string(),
    };
    let info = gpu_info::GpuInfo::new(gpus, gl, os_release);
    match blocklist::Blocklist::chromium() {
        Err(e) => return (true, format!("Chromium blocklist unreadable: {e}")),
        Ok(list) => {
            if let Some(entry) = list.blocking_entry(&info) {
                let assumed = if entry.assumed {
                    " (condition not evaluated, assumed met)"
                } else {
                    ""
                };
                return (
                    true,
                    format!(
                        "Chromium blocklist #{}: {}{assumed}",
                        entry.id, entry.description
                    ),
                );
            }
        }
    }
    let lower = renderer.to_lowercase();
    if SOFTWARE_RENDERER_MARKERS.iter().any(|m| lower.contains(m)) {
        return (true, format!("software renderer {renderer:?}"));
    }
    let Some(draw_ms) = field("draw_ms")
        .and_then(|v| v.parse::<f64>().ok())
        .filter(|v| v.is_finite() && *v >= 0.0)
    else {
        return (true, format!("{renderer:?} reported no draw time"));
    };
    if draw_ms > MAX_HARDWARE_DRAW_MS {
        return (
            true,
            format!("{renderer:?} too slow: {draw_ms:.2} ms per draw"),
        );
    }
    (false, format!("{renderer:?} at {draw_ms:.2} ms per draw"))
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;
    use gpu_info::GpuDevice;

    const INTEL_REPORT: &str = "renderer=Mesa Intel(R) UHD Graphics 620 (KBL GT2)\nvendor=Intel\n\
        version=OpenGL ES 3.2 Mesa 25.0.7\nextensions=GL_OES_EGL_image\n";

    fn gpu(vendor_id: u32, device_id: u32) -> Vec<GpuDevice> {
        vec![GpuDevice {
            vendor_id,
            device_id,
            ..GpuDevice::default()
        }]
    }

    fn classify_alone(output: &str) -> (bool, String) {
        classify(output, Vec::new(), "6.8.0")
    }

    #[test]
    fn fast_gpu_chrome_trusts_is_hardware() {
        let (software, reason) = classify(
            &format!("{INTEL_REPORT}draw_ms=0.12\n"),
            gpu(0x8086, 0x5917),
            "6.8.0",
        );
        assert!(!software, "{reason}");
    }

    #[test]
    fn chrome_blocklist_overrules_a_fast_gpu() {
        let report = "renderer=SVGA3D; build: RELEASE; LLVM;\nvendor=VMware, Inc.\n\
            version=OpenGL ES 3.2 Mesa 25.0.7\ndraw_ms=0.12\n";
        let (software, reason) = classify(report, gpu(0x15ad, 0x0405), "6.8.0");
        assert!(software);
        assert!(reason.starts_with("Chromium blocklist #176"), "{reason}");
    }

    #[test]
    fn known_cpu_rasterizers_are_software_however_fast() {
        for renderer in [
            "llvmpipe (LLVM 20.1.2, 256 bits)",
            "virgl (LLVMPIPE (LLVM 15.0.7, 256 bits))",
            "softpipe",
            "Mesa Offscreen swrast",
            "D3D12 (Microsoft Basic Render Driver)",
            "Google SwiftShader",
        ] {
            let (software, reason) =
                classify_alone(&format!("renderer={renderer}\ndraw_ms=0.01\n"));
            assert!(software, "{renderer} -> {reason}");
        }
    }

    #[test]
    fn gpu_claim_that_draws_slowly_is_software() {
        let (software, reason) = classify(
            &format!("{INTEL_REPORT}draw_ms=37.5\n"),
            gpu(0x8086, 0x5917),
            "6.8.0",
        );
        assert!(software);
        assert!(reason.contains("too slow"), "{reason}");
    }

    #[test]
    fn incomplete_or_garbled_reports_are_software() {
        for output in [
            "",
            "error=eglInitialize failed\n",
            "renderer=\ndraw_ms=0.1\n",
            "renderer=Mesa Intel(R) UHD Graphics 620\n",
            "renderer=Mesa Intel(R) UHD Graphics 620\ndraw_ms=NaN\n",
            "renderer=Mesa Intel(R) UHD Graphics 620\ndraw_ms=-1\n",
        ] {
            assert!(classify_alone(output).0, "{output:?}");
        }
    }
}
