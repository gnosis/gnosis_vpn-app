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
                export PATH="${pkgs.rustc}/bin:${pkgs.cargo}/bin:$PATH"
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
              enable = pkgs.lib.meta.availableOn pkgs.stdenv.buildPlatform pkgs.nixfmt.compiler;
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

          # VM auto-detection by reading DMI info at eval time.
          # Usage: nix develop --impure
          isVM =
            let
              vmPattern = "vmware|virtualbox|kvm|qemu|xen|hyper-v|innotek";
              readLower =
                path: if builtins.pathExists path then pkgs.lib.toLower (builtins.readFile path) else "";
            in
            pkgs.stdenv.isLinux
            && (
              builtins.match (".*(" + vmPattern + ").*") (readLower "/sys/class/dmi/id/sys_vendor") != null
              || builtins.match (".*(" + vmPattern + ").*") (readLower "/sys/class/dmi/id/product_name") != null
            );

          vmPackages = pkgs.lib.optionals isVM [
            pkgs.libglvnd
            pkgs.libGL
            pkgs.mesa
          ];

        in
        {
          checks = {
            deno-lint = deno-lint;
          };
          devShells.default = craneLib.devShell {
            # Inherit inputs from checks.
            checks = self.checks.${system};

            # Extra inputs can be added here; cargo and rustc are provided by default.
            packages = [
              # nativeBuildInputs
              pkgs.pkg-config
              pkgs.cargo-tauri
              pkgs.nodejs
              pkgs.deno
              pkgs.openssl
              pkgs.rust-analyzer
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
              pkgs.patchelf
            ]
            ++ vmPackages
            ++ pkgs.lib.optionals pkgs.stdenv.isDarwin [
              # macOS-specific packages
              pkgs.libiconv
            ];

            LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath (
              pkgs.lib.optionals pkgs.stdenv.isLinux [
                pkgs.libayatana-appindicator
                pkgs.libproxy
              ]
            );

            shellHook = pkgs.lib.optionalString isVM ''
              # Force X11 backend to avoid Wayland/Mesa conflicts in VM
              unset WAYLAND_DISPLAY
              export GDK_BACKEND=x11

              # Disable WebKit hardware compositing
              export WEBKIT_DISABLE_COMPOSITING_MODE=1

              # Add GL/Mesa libraries needed in VM environments
              export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath vmPackages}:$LD_LIBRARY_PATH"
            '';
          };

          apps = {
            inherit generate-lockfile;
          };

          treefmt = treefmt;
        };
    };
}