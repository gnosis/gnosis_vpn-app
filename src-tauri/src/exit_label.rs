//! Every name the app gives an exit; the main window only looks these up, so it and the tray agree.

use gnosis_vpn_ipc as ipc;
use serde::Serialize;

use crate::country_names::country_name;

/// The client's META_FIELD_MAX_CHARS.
const META_FIELD_MAX_CHARS: usize = 64;

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ExitNames {
    /// The exit list's name: a configured exit's id, else the country, else the title.
    pub display_name: String,
    pub title: String,
    /// The address's last five characters: tells apart exits that share a country.
    pub short_id: String,
    /// Derived by the client; never the operator's claim.
    pub country: Option<String>,
    pub description: Option<String>,
}

impl ExitNames {
    pub fn of(d: &ipc::Destination) -> Self {
        let title = title(d);
        let country = d.geo.as_ref().map(|geo| country(geo.country));
        let address = d.address.to_string();
        // A configured id is the user's own handle, so it names the exit over the country.
        let configured = d.source != ipc::DestinationSource::Discovered;
        let display_name = if configured {
            d.id.to_string()
        } else {
            country.clone().unwrap_or_else(|| title.clone())
        };
        ExitNames {
            display_name,
            title,
            short_id: address[address.len() - 5..].to_string(),
            country,
            description: published(d.meta.description.as_deref()),
        }
    }

    /// `Australia #BeAed`, as the tray shows it.
    pub fn label(&self) -> String {
        format!("{} #{}", self.display_name, self.short_id)
    }
}

/// An unknown code shows as itself.
fn country(code: ipc::CountryCode) -> String {
    let code = code.to_string();
    country_name(&code).map_or(code, str::to_string)
}

/// A discovered id is the name slugged, so the name alone suffices; a configured id is the user's own handle and leads.
fn title(d: &ipc::Destination) -> String {
    let id = d.id.to_string();
    match (name(d), d.source) {
        (Some(name), ipc::DestinationSource::Discovered) => name,
        (Some(name), _) => format!("{id} ({name})"),
        (None, _) => id,
    }
}

/// The published name; one that respells the id says nothing new, unless config pinned it.
fn name(d: &ipc::Destination) -> Option<String> {
    let name = published(d.meta.name.as_deref())?;
    let pinned = d.source == ipc::DestinationSource::ConfiguredAndDiscovered
        && d.overrides.configured_meta.contains_key("name");
    (name != d.id.to_string() || pinned).then_some(name)
}

/// Operator text that is still there once sanitized.
fn published(text: Option<&str>) -> Option<String> {
    Some(sanitize(text?)).filter(|text| !text.is_empty())
}

/// Operator-published text, never shown verbatim: no controls or zero-width/bidi characters, and capped.
fn sanitize(text: &str) -> String {
    let cleaned: Vec<char> = text.chars().filter(|&c| !display_unsafe(c)).collect();
    if cleaned.len() <= META_FIELD_MAX_CHARS {
        return cleaned.into_iter().collect();
    }
    let mut capped: String = cleaned[..META_FIELD_MAX_CHARS].iter().collect();
    capped.push('\u{2026}');
    capped
}

fn display_unsafe(c: char) -> bool {
    c.is_control()
        || matches!(c, '\u{200B}'..='\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}' | '\u{FEFF}')
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::collections::BTreeMap;

    /// A discovered exit in `country`; its EIP-55 address ends in `BeAed`.
    pub(crate) fn destination(id: &str, country: Option<&str>) -> ipc::Destination {
        ipc::Destination {
            id: id.into(),
            meta: ipc::Meta::default(),
            geo: country.map(|c| ipc::Geo {
                country: c.parse().unwrap(),
                source: ipc::GeoSource::AnnouncedIp,
            }),
            address: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"
                .parse()
                .unwrap(),
            hops: ipc::Hops::try_from(1).unwrap(),
            gnosis_vpn_server: "172.30.0.1:8000".parse().unwrap(),
            wireguard_server: "172.30.0.1:51820".parse().unwrap(),
            source: ipc::DestinationSource::Discovered,
            overrides: ipc::Overrides::default(),
        }
    }

    fn named(mut d: ipc::Destination, name: &str) -> ipc::Destination {
        d.meta.name = Some(name.into());
        d
    }

    fn described(mut d: ipc::Destination, description: &str) -> ipc::Destination {
        d.meta.description = Some(description.into());
        d
    }

    #[test]
    fn a_located_exit_is_its_country_and_short_id() {
        let names = ExitNames::of(&named(destination("syd-1", Some("au")), "Sydney 1"));
        assert_eq!(
            names,
            ExitNames {
                display_name: "Australia".into(),
                title: "Sydney 1".into(),
                short_id: "BeAed".into(),
                country: Some("Australia".into()),
                description: None,
            }
        );
        assert_eq!(names.label(), "Australia #BeAed");
    }

    #[test]
    fn an_unknown_country_code_shows_as_itself() {
        let names = ExitNames::of(&destination("x", Some("QZ")));
        assert_eq!(names.country.as_deref(), Some("QZ"));
        assert_eq!(names.label(), "QZ #BeAed");
    }

    #[test]
    fn without_a_country_a_discovered_exit_is_its_name_else_its_id() {
        let d = named(destination("frankfurt-1", None), "Frankfurt 1");
        assert_eq!(ExitNames::of(&d).label(), "Frankfurt 1 #BeAed");
        let d = destination("frankfurt-1", None);
        assert_eq!(ExitNames::of(&d).display_name, "frankfurt-1");
    }

    #[test]
    fn a_configured_exit_leads_with_its_id() {
        let mut d = named(destination("my-exit", None), "Frankfurt 1");
        d.source = ipc::DestinationSource::Configured;
        assert_eq!(ExitNames::of(&d).title, "my-exit (Frankfurt 1)");
        d.meta.name = None;
        assert_eq!(ExitNames::of(&d).title, "my-exit");
    }

    #[test]
    fn a_configured_exit_is_listed_by_its_id_over_its_country() {
        let mut d = destination("GVPN-Bootstrap-1-DC-Amsterdam", Some("nl"));
        d.source = ipc::DestinationSource::Configured;
        let names = ExitNames::of(&d);
        assert_eq!(names.label(), "GVPN-Bootstrap-1-DC-Amsterdam #BeAed");
        assert_eq!(names.country.as_deref(), Some("Netherlands"));
        d.source = ipc::DestinationSource::ConfiguredAndDiscovered;
        assert_eq!(
            ExitNames::of(&d).display_name,
            "GVPN-Bootstrap-1-DC-Amsterdam"
        );
    }

    #[test]
    fn a_name_that_respells_the_id_is_dropped_unless_config_pinned_it() {
        let mut d = named(destination("my-exit", None), "my-exit");
        d.source = ipc::DestinationSource::ConfiguredAndDiscovered;
        assert_eq!(ExitNames::of(&d).title, "my-exit");
        d.overrides.configured_meta = BTreeMap::from([("name".into(), "my-exit".into())]);
        assert_eq!(ExitNames::of(&d).title, "my-exit (my-exit)");
    }

    #[test]
    fn a_name_that_sanitizes_to_nothing_is_absent() {
        let d = named(destination("0xabc-1234", None), "\u{200B}\u{202E}");
        assert_eq!(ExitNames::of(&d).title, "0xabc-1234");
    }

    #[test]
    fn spoofing_characters_are_stripped_and_long_names_capped() {
        let d = named(destination("x", None), "Evil\u{202E}exit\u{200B}\n");
        assert_eq!(ExitNames::of(&d).title, "Evilexit");
        let d = named(destination("x", None), &"a".repeat(70));
        assert_eq!(
            ExitNames::of(&d).title,
            format!("{}\u{2026}", "a".repeat(64))
        );
    }

    #[test]
    fn the_cap_counts_characters_not_bytes() {
        let d = named(destination("x", None), &"\u{1F1E9}".repeat(70));
        let title = ExitNames::of(&d).title;
        assert_eq!(title.chars().count(), 65);
        assert!(title.ends_with('\u{2026}'));
    }

    #[test]
    fn the_description_is_sanitized_capped_and_absent_when_empty() {
        let d = destination("x", None);
        assert_eq!(ExitNames::of(&d).description, None);
        let d = described(destination("x", None), "\u{202E}10Gbit uplink\u{200B}");
        assert_eq!(
            ExitNames::of(&d).description.as_deref(),
            Some("10Gbit uplink")
        );
        let d = described(destination("x", None), &"a".repeat(70));
        assert_eq!(
            ExitNames::of(&d).description,
            Some(format!("{}\u{2026}", "a".repeat(64)))
        );
        let d = described(destination("x", None), "\u{200B}");
        assert_eq!(ExitNames::of(&d).description, None);
    }
}
