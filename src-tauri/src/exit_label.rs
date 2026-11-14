//! The tray names an exit the way the main window does: `exitDisplayName` and `#exitShortId` in src/utils/destinations.ts.

use gnosis_vpn_ipc as ipc;

use crate::country_names::country_name;

/// The frontend's META_FIELD_MAX_CHARS.
const META_FIELD_MAX_CHARS: usize = 64;

/// `Australia #ddf4c`: the country, or the title when there is none, and the address's last five characters.
pub fn exit_label(d: &ipc::Destination) -> String {
    let name = match &d.geo {
        Some(geo) => country(&geo.country.to_string()),
        None => title(d),
    };
    let address = d.address.to_string();
    format!("{name} #{}", &address[address.len() - 5..])
}

/// An unknown code shows as itself, like `Intl.DisplayNames`' default fallback.
fn country(code: &str) -> String {
    let code = code.to_ascii_uppercase();
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
    let name = sanitize(d.meta.name.as_deref()?);
    if name.is_empty() {
        return None;
    }
    let pinned = d.source == ipc::DestinationSource::ConfiguredAndDiscovered
        && d.overrides.configured_meta.contains_key("name");
    (name != d.id.to_string() || pinned).then_some(name)
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

    #[test]
    fn a_located_exit_is_its_country_and_short_id() {
        assert_eq!(
            exit_label(&destination("syd-1", Some("AU"))),
            "Australia #BeAed"
        );
    }

    #[test]
    fn an_unknown_country_code_shows_as_itself() {
        assert_eq!(exit_label(&destination("x", Some("QZ"))), "QZ #BeAed");
    }

    #[test]
    fn without_a_country_a_discovered_exit_is_its_name() {
        let d = named(destination("frankfurt-1", None), "Frankfurt 1");
        assert_eq!(exit_label(&d), "Frankfurt 1 #BeAed");
    }

    #[test]
    fn without_a_country_a_configured_exit_leads_with_its_id() {
        let mut d = named(destination("my-exit", None), "Frankfurt 1");
        d.source = ipc::DestinationSource::Configured;
        assert_eq!(exit_label(&d), "my-exit (Frankfurt 1) #BeAed");
        d.meta.name = None;
        assert_eq!(exit_label(&d), "my-exit #BeAed");
    }

    #[test]
    fn a_name_that_respells_the_id_is_dropped_unless_config_pinned_it() {
        let mut d = named(destination("my-exit", None), "my-exit");
        d.source = ipc::DestinationSource::ConfiguredAndDiscovered;
        assert_eq!(exit_label(&d), "my-exit #BeAed");
        d.overrides.configured_meta = BTreeMap::from([("name".into(), "my-exit".into())]);
        assert_eq!(exit_label(&d), "my-exit (my-exit) #BeAed");
    }

    #[test]
    fn spoofing_characters_are_stripped_and_long_names_capped() {
        let d = named(destination("x", None), "Evil\u{202E}exit\u{200B}\n");
        assert_eq!(exit_label(&d), "Evilexit #BeAed");
        let d = named(destination("x", None), &"a".repeat(70));
        assert_eq!(exit_label(&d), format!("{}\u{2026} #BeAed", "a".repeat(64)));
    }
}
