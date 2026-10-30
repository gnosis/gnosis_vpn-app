//! Chromium's software rendering list, evaluated as Chrome's `GpuControlList` does for hardware GL.
//!
//! What this port can't evaluate leans to software: such a condition counts as met, such an exception as not applying.

use super::gpu_info::{GpuDevice, GpuInfo};
use regex::Regex;
use serde::Deserialize;
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::BTreeMap;

const CHROMIUM_LIST: &str =
    include_str!("../../../src/assets/gpu-blocklist/software_rendering_list.json");

/// Chrome composites through hardware GL only while this feature isn't blocklisted; "all" includes it.
const ACCELERATED_GL: &str = "accelerated_gl";

/// Entry keys that document an entry rather than condition it.
const METADATA: [&str; 4] = [
    "cr_bugs",
    "webkit_bugs",
    "driver_update_url",
    "driver_update_link",
];

#[derive(Deserialize)]
struct List {
    entries: Vec<Entry>,
}

#[derive(Deserialize)]
struct Entry {
    id: u32,
    #[serde(default)]
    description: String,
    #[serde(default)]
    features: Vec<Feature>,
    #[serde(default)]
    exceptions: Vec<Conditions>,
    #[serde(default)]
    disabled: bool,
    #[serde(default)]
    test_group: u32,
    #[serde(flatten)]
    conditions: Conditions,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum Feature {
    Name(String),
    AllExcept { exceptions: Vec<String> },
}

#[derive(Default, Deserialize)]
struct Conditions {
    os: Option<Os>,
    vendor_id: Option<String>,
    #[serde(default)]
    device_id: Vec<String>,
    multi_gpu_category: Option<String>,
    multi_gpu_style: Option<String>,
    driver_vendor: Option<String>,
    driver_version: Option<VersionCondition>,
    gl_vendor: Option<String>,
    gl_renderer: Option<String>,
    gl_extensions: Option<String>,
    direct_rendering_version: Option<VersionCondition>,
    in_process_gpu: Option<bool>,
    #[serde(default)]
    machine_model_name: Vec<String>,
    #[serde(flatten)]
    other: BTreeMap<String, Value>,
}

#[derive(Deserialize)]
struct Os {
    #[serde(rename = "type")]
    kind: Option<String>,
    version: Option<VersionCondition>,
    #[serde(flatten)]
    other: BTreeMap<String, Value>,
}

#[derive(Deserialize)]
struct VersionCondition {
    op: String,
    style: Option<String>,
    schema: Option<String>,
    #[serde(default)]
    value: String,
    #[serde(default)]
    value2: String,
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Verdict {
    Met,
    Unmet,
    /// Met as far as this port can tell; some condition went unevaluated.
    Assumed,
}

/// The entry that blocklists hardware GL on this machine.
pub struct Match<'a> {
    pub id: u32,
    pub description: &'a str,
    /// Rests on a condition this port couldn't evaluate.
    pub assumed: bool,
}

pub struct Blocklist {
    entries: Vec<Entry>,
}

impl Blocklist {
    /// The list vendored by `scripts/update-gpu-blocklist.py`.
    pub fn chromium() -> Result<Self, String> {
        Self::parse(CHROMIUM_LIST)
    }

    fn parse(json: &str) -> Result<Self, String> {
        let list: List = serde_json::from_str(json).map_err(|e| e.to_string())?;
        Ok(Blocklist {
            entries: list.entries,
        })
    }

    /// The first entry that, as in Chrome, takes hardware GL away from this GPU.
    pub fn blocking_entry(&self, info: &GpuInfo) -> Option<Match<'_>> {
        self.entries
            .iter()
            .filter(|entry| entry.blocks_hardware_gl())
            .find_map(|entry| {
                let verdict = entry.applies(info);
                (verdict != Verdict::Unmet).then_some(Match {
                    id: entry.id,
                    description: &entry.description,
                    assumed: verdict == Verdict::Assumed,
                })
            })
    }
}

impl Entry {
    fn blocks_hardware_gl(&self) -> bool {
        let gl_excepted = self.features.iter().any(|f| {
            matches!(f, Feature::AllExcept { exceptions } if exceptions.iter().any(|e| e == ACCELERATED_GL))
        });
        self.features.iter().any(|f| match f {
            Feature::Name(name) => name == ACCELERATED_GL || (name == "all" && !gl_excepted),
            Feature::AllExcept { .. } => false,
        })
    }

    /// Chrome's `Entry::Contains`, gated on `NeedsMoreInfo` as `MakeDecision` gates its features.
    fn applies(&self, info: &GpuInfo) -> Verdict {
        if self.disabled || self.test_group != 0 {
            return Verdict::Unmet;
        }
        let verdict = self.conditions.evaluate(info);
        // Chrome holds back an entry until it has every detail the entry asks about.
        if verdict == Verdict::Unmet || self.conditions.needs_more_info(info) {
            return Verdict::Unmet;
        }
        let excepted = self
            .exceptions
            .iter()
            .any(|e| e.evaluate(info) == Verdict::Met && !e.needs_more_info(info));
        if excepted { Verdict::Unmet } else { verdict }
    }
}

impl Conditions {
    fn unevaluated_keys(&self) -> impl Iterator<Item = &str> {
        let os_keys = self.os.iter().flat_map(|os| os.other.keys());
        self.other
            .keys()
            .chain(os_keys)
            .map(String::as_str)
            .filter(|key| !METADATA.contains(key))
    }

    /// Chrome's `Conditions::Contains`.
    fn evaluate(&self, info: &GpuInfo) -> Verdict {
        let mut assumed = self.unevaluated_keys().next().is_some();
        // Folds a tri-state check in: an unmet one decides, a non-evaluable one only taints.
        macro_rules! check {
            ($met:expr) => {
                match $met {
                    Some(false) => return Verdict::Unmet,
                    None => assumed = true,
                    Some(true) => {}
                }
            };
        }

        if let Some(os) = &self.os {
            match os.kind.as_deref().unwrap_or("any") {
                "any" => {}
                "linux" => {
                    if let Some(version) = &os.version {
                        check!(version.contains(&info.os_version));
                    }
                }
                _ => return Verdict::Unmet,
            }
        }

        let all_gpus = || -> Vec<&GpuDevice> {
            info.secondary_gpus
                .iter()
                .chain(std::iter::once(&info.gpu))
                .collect()
        };
        let active_gpus = || -> Vec<&GpuDevice> {
            let mut gpus = Vec::new();
            if info.gpu.active || info.secondary_gpus.is_empty() {
                gpus.push(&info.gpu);
            }
            gpus.extend(info.secondary_gpus.iter().filter(|g| g.active));
            if gpus.is_empty() {
                gpus.push(info.active_gpu());
            }
            gpus
        };
        let candidates = match self.multi_gpu_category.as_deref() {
            Some("primary") => vec![&info.gpu],
            Some("secondary") => info.secondary_gpus.iter().collect(),
            Some("npu") => Vec::new(),
            Some("any") => all_gpus(),
            Some("active") if !info.is_active_gpu_specified() => all_gpus(),
            None | Some("active") => active_gpus(),
            Some(_) => {
                assumed = true;
                all_gpus()
            }
        };

        let vendor_id = match self.vendor_id.as_deref().map(parse_hex) {
            None => 0,
            Some(Some(id)) => id,
            Some(None) => {
                assumed = true;
                0
            }
        };
        if vendor_id != 0 {
            let devices: Option<Vec<u32>> = self.device_id.iter().map(|d| parse_hex(d)).collect();
            check!(devices.map(|devices| {
                candidates.iter().any(|gpu| {
                    gpu.vendor_id == vendor_id
                        && (devices.is_empty() || devices.contains(&gpu.device_id))
                })
            }));
        }

        match self.multi_gpu_style.as_deref() {
            None => {}
            Some("optimus") => check!(Some(info.optimus)),
            Some("amd_switchable") => check!(Some(info.amd_switchable)),
            Some("amd_switchable_discrete") => check!(Some(info.amd_switchable && info.gpu.active)),
            Some("amd_switchable_integrated") => check!(Some(
                info.amd_switchable && info.secondary_gpus.first().is_some_and(|g| g.active)
            )),
            Some(_) => assumed = true,
        }

        if self.driver_vendor.is_some() || self.driver_version.is_some() {
            let mut matched = false;
            for gpu in candidates
                .iter()
                .filter(|gpu| vendor_id == 0 || gpu.vendor_id == vendor_id)
            {
                match string_mismatch(&gpu.driver_vendor, self.driver_vendor.as_deref()) {
                    Some(true) => continue,
                    None => assumed = true,
                    Some(false) => {}
                }
                if let Some(version) = &self.driver_version {
                    if !gpu.driver_version.is_empty() {
                        match version.contains(&gpu.driver_version) {
                            Some(false) => continue,
                            None => assumed = true,
                            Some(true) => {}
                        }
                    }
                }
                matched = true;
                break;
            }
            check!(Some(matched));
        }

        for (input, pattern) in [
            (&info.gl_extensions, &self.gl_extensions),
            (&info.gl_vendor, &self.gl_vendor),
            (&info.gl_renderer, &self.gl_renderer),
        ] {
            check!(string_mismatch(input, pattern.as_deref()).map(|mismatch| !mismatch));
        }

        // Chrome knows no machine model on Linux.
        check!(Some(self.machine_model_name.is_empty()));
        if let Some(version) = &self.direct_rendering_version {
            // EGL, unlike GLX, reports no direct-rendering version.
            check!(version.contains(""));
        }
        check!(Some(self.in_process_gpu != Some(true)));

        if assumed {
            Verdict::Assumed
        } else {
            Verdict::Met
        }
    }

    /// Chrome's `Conditions::NeedsMoreInfo`.
    fn needs_more_info(&self, info: &GpuInfo) -> bool {
        if self.multi_gpu_category.as_deref() == Some("active") && !info.is_active_gpu_specified() {
            return true;
        }
        let active = info.active_gpu();
        (self.driver_vendor.is_some() && active.driver_vendor.is_empty())
            || (self.driver_version.is_some() && active.driver_version.is_empty())
            || (self.gl_vendor.is_some() && info.gl_vendor.is_empty())
            || (self.gl_renderer.is_some() && info.gl_renderer.is_empty())
    }
}

impl VersionCondition {
    /// Chrome's `Version::Contains`; `None` for a condition this port doesn't understand.
    fn contains(&self, version: &str) -> Option<bool> {
        let lexical = match self.style.as_deref() {
            None | Some("numerical") => false,
            Some("lexical") => true,
            Some(_) => return None,
        };
        // The driver-specific schemas only exist for Windows driver versions.
        if !matches!(self.schema.as_deref(), None | Some("common")) {
            return None;
        }
        let op = self.op.as_str();
        if op == "any" {
            return Some(true);
        }
        if !["=", "<", "<=", ">", ">=", "between"].contains(&op) {
            return None;
        }
        let reference = version_segments(&self.value)?;
        let Some(version) = version_segments(version) else {
            return Some(false);
        };
        let relation = compare(&version, &reference, lexical);
        Some(match op {
            "=" => relation.is_eq(),
            "<" => relation.is_lt(),
            "<=" => relation.is_le(),
            ">" => relation.is_gt(),
            ">=" => relation.is_ge(),
            _ => {
                relation.is_ge()
                    && compare(&version, &version_segments(&self.value2)?, lexical).is_le()
            }
        })
    }
}

/// Chrome's `ProcessVersionString`: the numeric segments before the first other one; `None` if none or all zero.
fn version_segments(version: &str) -> Option<Vec<String>> {
    let segments: Vec<String> = version
        .split('.')
        .map(str::trim)
        .take_while(|s| s.parse::<u32>().is_ok())
        .map(String::from)
        .collect();
    segments
        .iter()
        .any(|s| s.parse::<u32>() != Ok(0))
        .then_some(segments)
}

/// Chrome's `Version::Compare`: only the reference's segments count, and lexical style reads non-major ones digit by digit.
fn compare(version: &[String], reference: &[String], lexical: bool) -> Ordering {
    for (i, reference) in reference.iter().enumerate() {
        let Some(version) = version.get(i) else {
            return Ordering::Equal;
        };
        let ordering = if i > 0 && lexical {
            let digits = version.as_bytes();
            reference
                .bytes()
                .enumerate()
                .map(|(j, r)| digits.get(j).map_or(0, |d| d - b'0').cmp(&(r - b'0')))
                .find(|o| o.is_ne())
                .unwrap_or(Ordering::Equal)
        } else {
            version
                .parse::<u32>()
                .ok()
                .cmp(&reference.parse::<u32>().ok())
        };
        if ordering.is_ne() {
            return ordering;
        }
    }
    Ordering::Equal
}

/// Chrome's `StringMismatch` over an RE2 full match: an empty side never mismatches. `None` if the pattern won't compile.
fn string_mismatch(input: &str, pattern: Option<&str>) -> Option<bool> {
    let Some(pattern) = pattern.filter(|p| !p.is_empty()) else {
        return Some(false);
    };
    if input.is_empty() {
        return Some(false);
    }
    let full_match = Regex::new(&format!("^(?:{pattern})$")).ok()?;
    Some(!full_match.is_match(input))
}

fn parse_hex(id: &str) -> Option<u32> {
    let digits = id.strip_prefix("0x").or_else(|| id.strip_prefix("0X"))?;
    u32::from_str_radix(digits, 16).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::render::gpu_info::GlStrings;

    fn info(gpus: &[(u32, u32)], vendor: &str, renderer: &str, version: &str) -> GpuInfo {
        GpuInfo::new(
            gpus.iter()
                .map(|&(vendor_id, device_id)| GpuDevice {
                    vendor_id,
                    device_id,
                    ..GpuDevice::default()
                })
                .collect(),
            GlStrings {
                vendor: vendor.into(),
                renderer: renderer.into(),
                version: version.into(),
                extensions: String::new(),
            },
            "6.8.0-45-generic",
        )
    }

    fn chromium_verdict(info: &GpuInfo) -> Option<u32> {
        Blocklist::chromium()
            .unwrap()
            .blocking_entry(info)
            .map(|m| m.id)
    }

    fn synthetic_verdict(entries: &str, info: &GpuInfo) -> Option<(u32, bool)> {
        Blocklist::parse(&format!(r#"{{"entries": [{entries}]}}"#))
            .unwrap()
            .blocking_entry(info)
            .map(|m| (m.id, m.assumed))
    }

    const MESA: &str = "OpenGL ES 3.2 Mesa 25.0.7";

    #[test]
    fn linux_entries_use_only_conditions_this_port_evaluates() {
        // A new condition upstream fails here first: teach `evaluate` about it before taking the update.
        const ASSUMED: [&str; 2] = ["intel_gpu_series", "intel_gpu_generation"];
        let list = Blocklist::chromium().unwrap();
        let linux_gl_entries = list.entries.iter().filter(|e| {
            e.blocks_hardware_gl()
                && e.conditions
                    .os
                    .as_ref()
                    .and_then(|os| os.kind.as_deref())
                    .is_none_or(|kind| kind == "linux" || kind == "any")
        });
        for entry in linux_gl_entries {
            for conditions in std::iter::once(&entry.conditions).chain(&entry.exceptions) {
                for key in conditions.unevaluated_keys() {
                    assert!(ASSUMED.contains(&key), "entry #{} uses {key}", entry.id);
                }
            }
        }
    }

    #[test]
    fn chrome_blocklists_these_linux_setups() {
        for (setup, gpu_info, id) in [
            (
                "VMware SVGA3D",
                info(
                    &[(0x15ad, 0x0405)],
                    "VMware, Inc.",
                    "SVGA3D; build: RELEASE; LLVM;",
                    MESA,
                ),
                176,
            ),
            (
                "llvmpipe",
                info(
                    &[(0x1234, 0x1111)],
                    "Mesa",
                    "llvmpipe (LLVM 20.1.2, 256 bits)",
                    MESA,
                ),
                3,
            ),
            (
                "virgl on a host without a GPU",
                info(
                    &[(0x1af4, 0x1050)],
                    "Mesa",
                    "virgl (LLVMPIPE (LLVM 15.0.7, 256 bits))",
                    MESA,
                ),
                3,
            ),
            (
                "nouveau",
                info(&[(0x10de, 0x1c82)], "nouveau", "NV137", MESA),
                30,
            ),
            (
                "NVIDIA 290",
                info(
                    &[(0x10de, 0x0de1)],
                    "NVIDIA Corporation",
                    "GeForce GT 430/PCIe/SSE2",
                    "4.2.0 NVIDIA 290.10",
                ),
                47,
            ),
            (
                "VirtualBox VGA",
                info(
                    &[(0x80ee, 0xbeef)],
                    "Humper",
                    "Chromium",
                    "2.1 Chromium 1.9",
                ),
                125,
            ),
        ] {
            assert_eq!(chromium_verdict(&gpu_info), Some(id), "{setup}");
        }
    }

    #[test]
    fn chrome_trusts_these_linux_setups() {
        for (setup, gpu_info) in [
            (
                "Intel on Mesa",
                info(
                    &[(0x8086, 0x5917)],
                    "Intel",
                    "Mesa Intel(R) UHD Graphics 620 (KBL GT2)",
                    MESA,
                ),
            ),
            (
                "AMD on Mesa",
                info(
                    &[(0x1002, 0x73bf)],
                    "AMD",
                    "AMD Radeon RX 6800 (radeonsi, navi21, LLVM 17.0.6, DRM 3.54, 6.8.0)",
                    MESA,
                ),
            ),
            (
                "NVIDIA 550",
                info(
                    &[(0x10de, 0x2504)],
                    "NVIDIA Corporation",
                    "NVIDIA GeForce RTX 3060/PCIe/SSE2",
                    "OpenGL ES 3.2 NVIDIA 550.54.14",
                ),
            ),
            (
                "Optimus on Mesa",
                info(
                    &[(0x8086, 0x9a49), (0x10de, 0x25a2)],
                    "Intel",
                    "Mesa Intel(R) Xe Graphics (TGL GT2)",
                    MESA,
                ),
            ),
            (
                "virgl on a host GPU",
                info(
                    &[(0x1af4, 0x1050)],
                    "Mesa",
                    "virgl (AMD Radeon RX 6800)",
                    MESA,
                ),
            ),
        ] {
            assert_eq!(chromium_verdict(&gpu_info), None, "{setup}");
        }
    }

    #[test]
    fn only_entries_taking_accelerated_gl_count() {
        let gpu_info = info(
            &[(0x8086, 0x5917)],
            "Intel",
            "Mesa Intel(R) UHD Graphics 620",
            MESA,
        );
        let entries = r#"
            {"id": 1, "features": ["accelerated_webgl"]},
            {"id": 2, "features": ["all", {"exceptions": ["accelerated_gl"]}]},
            {"id": 3, "test_group": 1, "features": ["all"]},
            {"id": 4, "disabled": true, "features": ["all"]},
            {"id": 5, "os": {"type": "win"}, "features": ["all"]},
            {"id": 6, "features": ["accelerated_gl"]}"#;
        assert_eq!(synthetic_verdict(entries, &gpu_info), Some((6, false)));
    }

    #[test]
    fn exceptions_and_missing_details_spare_a_gpu_as_in_chrome() {
        let gpu_info = info(
            &[(0x8086, 0x5917)],
            "Intel",
            "Mesa Intel(R) UHD Graphics 620",
            MESA,
        );
        let excepted = r#"{"id": 1, "vendor_id": "0x8086", "features": ["all"],
            "exceptions": [{"driver_vendor": "Mesa", "driver_version": {"op": ">=", "value": "20.0"}}]}"#;
        assert_eq!(synthetic_verdict(excepted, &gpu_info), None);

        let unparsed_driver = info(
            &[(0x8086, 0x5917)],
            "Intel",
            "Mesa Intel(R) UHD Graphics 620",
            "OpenGL ES 3.2",
        );
        let needs_driver =
            r#"{"id": 1, "driver_version": {"op": "<", "value": "30.0"}, "features": ["all"]}"#;
        assert_eq!(synthetic_verdict(needs_driver, &unparsed_driver), None);
        assert_eq!(synthetic_verdict(needs_driver, &gpu_info), Some((1, false)));
    }

    #[test]
    fn unevaluated_conditions_lean_to_software() {
        let gpu_info = info(
            &[(0x8086, 0x5917)],
            "Intel",
            "Mesa Intel(R) UHD Graphics 620",
            MESA,
        );
        let unknown_condition = r#"{"id": 1, "os": {"type": "linux"}, "gpu_count": {"op": ">", "value": "1"}, "features": ["all"]}"#;
        assert_eq!(
            synthetic_verdict(unknown_condition, &gpu_info),
            Some((1, true))
        );

        let unknown_exception = r#"{"id": 1, "vendor_id": "0x8086", "features": ["all"],
            "exceptions": [{"intel_gpu_generation": {"op": ">=", "value": "9"}}]}"#;
        assert_eq!(
            synthetic_verdict(unknown_exception, &gpu_info),
            Some((1, false))
        );

        let unknown_condition_unmet = r#"{"id": 1, "vendor_id": "0x10de", "gpu_count": {"op": ">", "value": "1"}, "features": ["all"]}"#;
        assert_eq!(synthetic_verdict(unknown_condition_unmet, &gpu_info), None);
    }

    #[test]
    fn versions_compare_as_chrome_compares_them() {
        let condition =
            |op: &str, style: Option<&str>, value: &str, value2: &str| VersionCondition {
                op: op.into(),
                style: style.map(String::from),
                schema: None,
                value: value.into(),
                value2: value2.into(),
            };
        let lt = condition("<", None, "10.1", "");
        assert_eq!(lt.contains("10.0.4"), Some(true));
        assert_eq!(
            lt.contains("10.1.3"),
            Some(false),
            "only the reference's segments count"
        );
        assert_eq!(lt.contains("24.0.5-1ubuntu1"), Some(false));
        assert_eq!(lt.contains(""), Some(false), "no version never matches");
        assert_eq!(
            lt.contains("0.0"),
            Some(false),
            "an all-zero version is invalid"
        );
        assert_eq!(
            condition(">=", Some("lexical"), "8.98", "").contains("8.982"),
            Some(true)
        );
        assert_eq!(
            condition(">=", Some("lexical"), "8.98", "").contains("8.9"),
            Some(false)
        );
        assert_eq!(
            condition("between", None, "3.0", "3.19").contains("3.10"),
            Some(true)
        );
        assert_eq!(
            condition("between", None, "3.0", "3.19").contains("4.0"),
            Some(false)
        );
        assert_eq!(condition("any", None, "", "").contains(""), Some(true));
        assert_eq!(condition("~", None, "1", "").contains("1"), None);
    }
}
