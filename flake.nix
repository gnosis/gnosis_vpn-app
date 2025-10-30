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

          generate-lockfile = {
            type = "app";
            program = toString (
              pkgs.writeShellScript "generate-lockfile" ''
                export PATH="${craneLib.rustc}/bin:$PATH"
                exec cargo generate-lockfile "$@"
              ''
            );
            meta.description = "Generate Cargo.lock with minimal dependencies (Rust toolchain only)";
          };

          treefmt = {
            projectRootFile = "LICENSE";

            settings.global.excludes = [
              "LICENSE"
            ];

            programs.nixfmt = {
              enable = pkgs.lib.meta.availableOn pkgs.stdenv.buildPlatform pkgs.nixfmt-rfc-style.compiler;
              package = pkgs.nixfmt-rfc-style;
            };

            # Deno is used for formatting and linting
            # Treefmt can only do formatting, linting has an extra target below
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

          # Deno is used for linting and formatting
          # Formatting is configured above in treefmt
          deno-lint =
            pkgs.runCommand "deno lint"
              {
                src = ./.;
              }
              ''
                ${pkgs.deno}/bin/deno lint $src
                # needs to create something or the flake will fail
                mkdir -p $out
              '';

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
              pkgs.cargo-tauri
              pkgs.nodejs
              pkgs.deno
              pkgs.openssl
            ]
            ++ pkgs.lib.optionals pkgs.stdenv.isLinux [
              # Linux-specific packages
              pkgs.gobject-introspection
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
              pkgs.libayatana-appindicator
            ]
            ++ pkgs.lib.optionals pkgs.stdenv.isDarwin [
              # macOS-specific packages
              pkgs.libiconv
            ];

            LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath (
              pkgs.lib.optionals pkgs.stdenv.isLinux [
                pkgs.libayatana-appindicator
              ]
            );
          };

          apps = {
            inherit generate-lockfile;
          };

          treefmt = treefmt;
        };
    };
}
