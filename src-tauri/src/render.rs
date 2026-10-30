//! Decides, before the webview starts, whether GPU compositing and full-rate animation are affordable.

use serde::Serialize;
use std::sync::OnceLock;

#[cfg(target_os = "linux")]
mod egl;

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
/// Slowest finished probe measured: softpipe at half a CPU, 1.43 s; past this the driver is treated as hung.
const PROBE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);

/// Renderer names of CPU rasterizers, also when wrapped (e.g. "virgl (LLVMPIPE …)"); draw time alone misses llvmpipe on 16 threads (~3 ms).
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
fn is_cpu_rasterizer(renderer: &str) -> bool {
    let lower = renderer.to_lowercase();
    SOFTWARE_RENDERER_MARKERS.iter().any(|m| lower.contains(m))
}

#[cfg(target_os = "linux")]
fn detect() -> RenderProfile {
    // Anything short of a probe that renders, fast, on a named GPU counts as software.
    let (software_rendering, reason) = match probe_in_child() {
        Ok(output) => classify(&output),
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

/// `(software_rendering, reason)` from the probe child's `key=value` report.
#[cfg(target_os = "linux")]
fn classify(output: &str) -> (bool, String) {
    let field = |key: &str| {
        output
            .lines()
            .find_map(|line| line.strip_prefix(key)?.strip_prefix('='))
    };
    let Some(renderer) = field("renderer").filter(|r| !r.trim().is_empty()) else {
        return (true, format!("no renderer reported: {:?}", output.trim()));
    };
    if is_cpu_rasterizer(renderer) {
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

    #[test]
    fn fast_named_gpu_is_hardware() {
        let (software, _) =
            classify("renderer=SVGA3D; build: RELEASE; LLVM;\nvendor=VMware, Inc.\ndraw_ms=0.12\n");
        assert!(!software);
    }

    #[test]
    fn nvidia_reached_through_an_egl_device_is_hardware() {
        let (software, reason) = classify(
            "display=device\nrenderer=NVIDIA GeForce RTX 3060/PCIe/SSE2\nvendor=NVIDIA Corporation\ndraw_ms=0.08\n",
        );
        assert!(!software, "{reason}");
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
            let (software, reason) = classify(&format!("renderer={renderer}\ndraw_ms=0.01\n"));
            assert!(software, "{renderer} -> {reason}");
        }
    }

    #[test]
    fn gpu_claim_that_draws_slowly_is_software() {
        let (software, reason) = classify("renderer=virgl\ndraw_ms=37.5\n");
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
            assert!(classify(output).0, "{output:?}");
        }
    }
}
