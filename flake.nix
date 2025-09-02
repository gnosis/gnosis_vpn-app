{
  description = "Gnosis VPN client applications";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    crane.url = "github:ipetkov/crane";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs =
    inputs@{ self
    , nixpkgs
    , crane
    , flake-parts
    , ...
    }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [
        # To import a flake module
        # 1. Add foo to inputs
        # 2. Add foo as a parameter to the outputs function
        # 3. Add here: foo.flakeModule
      ];
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];
      perSystem =
        { config
        , self'
        , inputs'
        , lib
        , system
        , ...
        }:
        let
          pkgs = (
            import nixpkgs {
              system = system;
            }
          );

          craneLib = crane.mkLib pkgs;
        in
        {
          devShells.default = craneLib.devShell {
            # Inherit inputs from checks.
            checks = self.checks.${system};

            # Additional dev-shell environment variables can be set directly
            # MY_CUSTOM_DEVELOPMENT_VAR = "something else";

            # Extra inputs can be added here; cargo and rustc are provided by default.
            packages = [
              # nativeBuildInputs
              pkgs.pkg-config
              pkgs.gobject-introspection
              pkgs.cargo-tauri
              pkgs.nodejs
              pkgs.deno
              # buildInputs
              pkgs.at-spi2-atk
              pkgs.atkmm
              pkgs.cairo
              pkgs.gdk-pixbuf
              pkgs.glib
              pkgs.gtk3
              pkgs.harfbuzz
              pkgs.librsvg
              pkgs.libsoup_3
              pkgs.pango
              pkgs.webkitgtk_4_1
              pkgs.openssl
              pkgs.libayatana-appindicator
            ];

            LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath (
              [
                pkgs.libayatana-appindicator
              ]
            );
          };
        };
    };
}
