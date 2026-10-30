//! What Chrome's GPU info collector gathers on Linux: PCI GPUs, the GL strings, and the driver named in GL_VERSION.

use std::path::Path;

const NVIDIA: u32 = 0x10de;
const INTEL: u32 = 0x8086;
const AMD: u32 = 0x1002;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct GpuDevice {
    pub vendor_id: u32,
    pub device_id: u32,
    pub active: bool,
    pub driver_vendor: String,
    pub driver_version: String,
}

#[derive(Clone, Debug, Default)]
pub struct GpuInfo {
    /// The boot display adapter; Chrome's `gpu`.
    pub gpu: GpuDevice,
    pub secondary_gpus: Vec<GpuDevice>,
    pub optimus: bool,
    pub amd_switchable: bool,
    pub gl_vendor: String,
    pub gl_renderer: String,
    pub gl_version: String,
    pub gl_extensions: String,
    /// Kernel release cut to its numeric prefix, as Chrome compares the OS version on Linux.
    pub os_version: String,
}

/// The GL strings the probe child read from the context the webview would get.
#[derive(Clone, Debug, Default)]
pub struct GlStrings {
    pub vendor: String,
    pub renderer: String,
    pub version: String,
    pub extensions: String,
}

impl GpuInfo {
    /// Assembles the info as Chrome's `CollectGraphicsInfoGL` does once its GL context is up.
    pub fn new(mut gpus: Vec<GpuDevice>, gl: GlStrings, os_release: &str) -> Self {
        let gpu = if gpus.is_empty() {
            GpuDevice::default()
        } else {
            gpus.remove(0)
        };
        let has = |vendor_id: u32| {
            std::iter::once(&gpu)
                .chain(&gpus)
                .any(|g| g.vendor_id == vendor_id)
        };
        // Integrated Intel beside a discrete GPU, as ANGLE labels dual-GPU systems.
        let (optimus, amd_switchable) = (has(INTEL) && has(NVIDIA), has(INTEL) && has(AMD));
        let mut info = GpuInfo {
            gpu,
            secondary_gpus: gpus,
            optimus,
            amd_switchable,
            gl_vendor: gl.vendor,
            gl_renderer: gl.renderer,
            gl_version: gl.version,
            gl_extensions: gl.extensions,
            os_version: numeric_prefix(os_release).to_string(),
        };
        info.identify_active_gpu();
        let (driver_vendor, driver_version) = parse_driver_info(&info.gl_version);
        let active = info.active_gpu_mut();
        active.driver_vendor = driver_vendor;
        active.driver_version = driver_version;
        info
    }

    pub fn is_active_gpu_specified(&self) -> bool {
        self.gpu.active || self.secondary_gpus.iter().any(|g| g.active)
    }

    pub fn active_gpu(&self) -> &GpuDevice {
        if self.gpu.active || self.secondary_gpus.is_empty() {
            return &self.gpu;
        }
        self.secondary_gpus
            .iter()
            .find(|g| g.active)
            .unwrap_or(&self.gpu)
    }

    fn active_gpu_mut(&mut self) -> &mut GpuDevice {
        if self.gpu.active || self.secondary_gpus.is_empty() {
            return &mut self.gpu;
        }
        match self.secondary_gpus.iter().position(|g| g.active) {
            Some(i) => &mut self.secondary_gpus[i],
            None => &mut self.gpu,
        }
    }

    /// Chrome's `IdentifyActiveGPU`: the boot GPU, unless the GL strings name another GPU's vendor.
    fn identify_active_gpu(&mut self) {
        self.gpu.active = true;
        if self.secondary_gpus.is_empty() {
            return;
        }
        const VENDORS: [(&str, u32); 5] = [
            ("nvidia", NVIDIA),
            ("nouveau", NVIDIA),
            ("intel", INTEL),
            ("amd", AMD),
            ("ati", AMD),
        ];
        let named = |s: &str| {
            let lower = s.to_lowercase();
            VENDORS
                .iter()
                .find(|(name, _)| lower.contains(name))
                .map(|(_, id)| *id)
        };
        let Some(vendor_id) = named(&self.gl_vendor).or_else(|| named(&self.gl_renderer)) else {
            return;
        };
        self.gpu.active = self.gpu.vendor_id == vendor_id;
        let mut found = self.gpu.active;
        for gpu in &mut self.secondary_gpus {
            gpu.active = !found && gpu.vendor_id == vendor_id;
            found |= gpu.active;
        }
    }
}

/// PCI display controllers, boot adapter first; what ANGLE's system info reports to Chrome.
pub fn pci_gpus() -> Vec<GpuDevice> {
    let Ok(dir) = std::fs::read_dir("/sys/bus/pci/devices") else {
        return Vec::new();
    };
    let mut gpus: Vec<(bool, String, GpuDevice)> = dir
        .flatten()
        .filter_map(|dev| {
            let path = dev.path();
            let class = read_hex(&path.join("class"))?;
            if class >> 16 != 0x03 {
                return None;
            }
            let boot_vga =
                std::fs::read_to_string(path.join("boot_vga")).is_ok_and(|s| s.trim() == "1");
            let device = GpuDevice {
                vendor_id: read_hex(&path.join("vendor"))?,
                device_id: read_hex(&path.join("device"))?,
                ..GpuDevice::default()
            };
            Some((
                boot_vga,
                dev.file_name().to_string_lossy().into_owned(),
                device,
            ))
        })
        .collect();
    gpus.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    gpus.into_iter().map(|(_, _, gpu)| gpu).collect()
}

pub fn os_release() -> String {
    std::fs::read_to_string("/proc/sys/kernel/osrelease").unwrap_or_default()
}

fn read_hex(path: &Path) -> Option<u32> {
    let text = std::fs::read_to_string(path).ok()?;
    u32::from_str_radix(text.trim().trim_start_matches("0x"), 16).ok()
}

fn numeric_prefix(s: &str) -> &str {
    let s = s.trim();
    let end = s
        .find(|c: char| !c.is_ascii_digit() && c != '.')
        .unwrap_or(s.len());
    &s[..end]
}

/// Chrome's `GLVersionInfo::ParseDriverInfo`: `(driver_vendor, driver_version)` from GL_VERSION.
pub fn parse_driver_info(gl_version: &str) -> (String, String) {
    let found = |vendor: &str, version: &str| (vendor.to_string(), version.to_string());
    let rest = gl_version.strip_prefix("OpenGL ES ").unwrap_or(gl_version);
    let mut pieces: Vec<&str> = rest
        .split([' ', '-', '(', ')', '@'])
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .collect();
    if pieces.is_empty() {
        return Default::default();
    }
    if let Some(stripped) = pieces[0].strip_suffix('V') {
        pieces[0] = stripped;
    }
    if pieces.len() == 1 {
        return Default::default();
    }
    const VENDORS: [(&str, &str); 10] = [
        ("ANGLE", "ANGLE"),
        ("Mesa", "Mesa"),
        ("INTEL", "INTEL"),
        ("NVIDIA", "NVIDIA"),
        ("ATI", "ATI"),
        ("FireGL", "FireGL"),
        ("Chromium", "Chromium"),
        ("APPLE", "APPLE"),
        ("AMD", "AMD"),
        ("Metal", "Apple"),
    ];
    for (i, piece) in pieces.iter().enumerate().skip(1) {
        if let Some((_, vendor)) = VENDORS.iter().find(|(key, _)| key == piece) {
            return found(vendor, pieces.get(i + 1).copied().unwrap_or(""));
        }
    }
    if pieces.len() == 2 {
        return found("", pieces[1].strip_prefix('V').unwrap_or(pieces[1]));
    }
    if let Some(mali) = pieces[1].strip_prefix("v1.r") {
        let numbers: Vec<&str> = mali.split('p').filter(|n| !n.is_empty()).collect();
        let parts: Vec<&str> = pieces[2].split('.').filter(|p| !p.is_empty()).collect();
        if numbers.len() == 2 && parts.len() == 2 {
            return found(
                "ARM",
                &format!("{}.{}.{}", numbers[0], numbers[1], parts[0]),
            );
        }
        return Default::default();
    }
    pieces[1..]
        .iter()
        .find(|p| p.contains('.'))
        .map_or_else(Default::default, |v| found("", v))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device(vendor_id: u32, device_id: u32) -> GpuDevice {
        GpuDevice {
            vendor_id,
            device_id,
            ..GpuDevice::default()
        }
    }

    #[test]
    fn driver_comes_from_gl_version_like_chrome() {
        for (gl_version, vendor, version) in [
            ("OpenGL ES 3.2 Mesa 24.0.5-1ubuntu1", "Mesa", "24.0.5"),
            ("4.6 (Core Profile) Mesa 25.0.7", "Mesa", "25.0.7"),
            ("OpenGL ES 3.2 NVIDIA 550.54.14", "NVIDIA", "550.54.14"),
            (
                "OpenGL ES 3.2 v1.r12p0-04rel0.44f2946824bb8739781564bffe2110c9",
                "ARM",
                "12.0.04rel0",
            ),
            ("OpenGL ES 3.1 V@415.0", "", "415.0"),
            ("OpenGL ES 2.0", "", ""),
            ("", "", ""),
        ] {
            assert_eq!(
                parse_driver_info(gl_version),
                (vendor.to_string(), version.to_string()),
                "{gl_version:?}"
            );
        }
    }

    #[test]
    fn single_gpu_is_active_and_carries_the_driver() {
        let info = GpuInfo::new(
            vec![device(0x15ad, 0x0405)],
            GlStrings {
                vendor: "VMware, Inc.".into(),
                renderer: "SVGA3D; build: RELEASE; LLVM;".into(),
                version: "OpenGL ES 3.2 Mesa 25.0.7".into(),
                ..GlStrings::default()
            },
            "6.8.0-45-generic",
        );
        assert!(info.gpu.active);
        assert_eq!(info.gpu.driver_vendor, "Mesa");
        assert_eq!(info.gpu.driver_version, "25.0.7");
        assert_eq!(info.os_version, "6.8.0");
        assert!(!info.optimus);
    }

    #[test]
    fn gl_strings_pick_the_active_gpu_of_two() {
        let info = GpuInfo::new(
            vec![device(INTEL, 0x9a49), device(NVIDIA, 0x25a2)],
            GlStrings {
                vendor: "NVIDIA Corporation".into(),
                renderer: "NVIDIA GeForce RTX 3050/PCIe/SSE2".into(),
                version: "OpenGL ES 3.2 NVIDIA 550.54.14".into(),
                ..GlStrings::default()
            },
            "6.8.0",
        );
        assert!(info.optimus);
        assert!(!info.gpu.active);
        assert_eq!(info.active_gpu().vendor_id, NVIDIA);
        assert_eq!(info.active_gpu().driver_version, "550.54.14");
        assert!(info.gpu.driver_version.is_empty());
    }

    #[test]
    fn unnamed_vendor_keeps_the_boot_gpu_active() {
        let info = GpuInfo::new(
            vec![device(INTEL, 0x9a49), device(NVIDIA, 0x25a2)],
            GlStrings {
                vendor: "Mesa".into(),
                renderer: "llvmpipe (LLVM 20.1.2, 256 bits)".into(),
                version: "OpenGL ES 3.2 Mesa 25.0.7".into(),
                ..GlStrings::default()
            },
            "6.8.0",
        );
        assert!(info.gpu.active);
        assert_eq!(info.active_gpu().vendor_id, INTEL);
        assert_eq!(info.active_gpu().driver_vendor, "Mesa");
    }
}
