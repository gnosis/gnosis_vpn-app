{
  description = "Gnosis VPN application";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    crane.url = "github:ipetkov/crane";
    flake-parts.url = "github:hercules-ci/flake-parts";
    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

  };

  outputs =
    inputs@{
      self,
      nixpkgs,
      crane,
      flake-parts,
      treefmt-nix,
      ...
    }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [
        treefmt-nix.flakeModule
      ];
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];
      perSystem =
        {
          config,
          self',
          inputs',
          lib,
          system,
          ...
        }:
        let
          pkgs = (
            import nixpkgs {
              system = system;
            }
          );

          craneLib = crane.mkLib pkgs;

          treefmt = {
            projectRootFile = "LICENSE";

            settings.global.excludes = [
              "LICENSE"
            ];

            programs.nixfmt = {
              enable = pkgs.lib.meta.availableOn pkgs.stdenv.buildPlatform pkgs.nixfmt-rfc-style.compiler;
              package = pkgs.nixfmt-rfc-style;
            };

            programs.deno.enable = true;
            settings.formatter.deno.settings = {
              formatter.line_width = 120;
            };
            settings.formatter.deno.includes = [
              "*.css"
              "*.html"
              "*.js"
              "*.json"
              "*.jsonc"
              "*.jsx"
              "*.less"
              "*.markdown"
              "*.md"
              "*.sass"
              "*.scss"
              "*.ts"
              "*.tsx"
              "*.yaml"
              "*.yml"
            ];
            programs.rustfmt.enable = true;
            programs.shellcheck.enable = true;
            programs.shfmt = {
              enable = true;
              indent_size = 4;
            };
            programs.taplo.enable = true; # TOML formatter
          };

          deno-lint = pkgs.runCommand "deno lint" {
            src = ./.;
          } ''${pkgs.deno}/bin/deno lint $src '';

        in
        {
          checks = {
            deno-lint = deno-lint;
          };
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

            LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath ([
              pkgs.libayatana-appindicator
            ]);
          };
          treefmt = treefmt;
        };
    };
}
