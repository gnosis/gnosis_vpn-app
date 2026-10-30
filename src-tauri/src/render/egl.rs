//! Offscreen GL probe: the renderer the driver names, and how fast it really draws.

use libloading::Library;
use std::ffi::{CStr, c_char, c_void};
use std::ptr::{null, null_mut};
use std::time::Instant;

type EglDisplay = *mut c_void;
type EglConfig = *mut c_void;
type EglContext = *mut c_void;
type EglSurface = *mut c_void;

const EGL_EXTENSIONS: i32 = 0x3055;
const EGL_NONE: i32 = 0x3038;
const EGL_SURFACE_TYPE: i32 = 0x3033;
const EGL_PBUFFER_BIT: i32 = 0x0001;
const EGL_RENDERABLE_TYPE: i32 = 0x3040;
const EGL_OPENGL_ES2_BIT: i32 = 0x0004;
const EGL_RED_SIZE: i32 = 0x3024;
const EGL_GREEN_SIZE: i32 = 0x3023;
const EGL_BLUE_SIZE: i32 = 0x3022;
const EGL_WIDTH: i32 = 0x3057;
const EGL_HEIGHT: i32 = 0x3056;
const EGL_CONTEXT_CLIENT_VERSION: i32 = 0x3098;
const EGL_OPENGL_ES_API: u32 = 0x30A0;
const EGL_PLATFORM_SURFACELESS_MESA: u32 = 0x31DD;

const GL_VENDOR: u32 = 0x1F00;
const GL_RENDERER: u32 = 0x1F01;
const GL_VERTEX_SHADER: u32 = 0x8B31;
const GL_FRAGMENT_SHADER: u32 = 0x8B30;
const GL_COMPILE_STATUS: u32 = 0x8B81;
const GL_LINK_STATUS: u32 = 0x8B82;
const GL_FLOAT: u32 = 0x1406;
const GL_TRIANGLES: u32 = 0x0004;
const GL_BLEND: u32 = 0x0BE2;
const GL_ONE: u32 = 1;
const GL_RGBA: u32 = 0x1908;
const GL_UNSIGNED_BYTE: u32 = 0x1401;
const GL_NO_ERROR: u32 = 0;

const SURFACE_SIZE: i32 = 256;
const TIMED_DRAWS: u32 = 8;
// Far past any GPU already, so slow rasterizers don't stall app startup for the full count.
const DRAW_BUDGET: std::time::Duration = std::time::Duration::from_millis(100);

const VERTEX_SHADER: &CStr =
    c"attribute vec2 p; varying vec2 v; void main() { v = p; gl_Position = vec4(p, 0.0, 1.0); }";
// Trig-heavy so GPUs stay sub-millisecond while CPU rasterizers take tens of milliseconds.
const FRAGMENT_SHADER: &CStr = c"precision mediump float; varying vec2 v; uniform float s;
void main() {
  float a = s;
  for (int i = 0; i < 64; i++) { a = sin(a + v.x * 3.1) * cos(a - v.y * 2.7) + a * 0.5; }
  gl_FragColor = vec4(a, a * 0.5, 1.0 - a, 0.1);
}";

/// Copies a function pointer out of `$lib` into a local of the same name.
macro_rules! load {
    ($lib:expr, $name:ident: $ty:ty) => {
        let $name: $ty = *$lib
            .get::<$ty>(concat!(stringify!($name), "\0").as_bytes())
            .map_err(|e| format!("{}: {e}", stringify!($name)))?;
    };
}

/// Resolves a GLES entry point through EGL into a local of the same name.
macro_rules! load_gl {
    ($get_proc_address:expr, $name:ident: $ty:ty) => {
        let address = $get_proc_address(concat!(stringify!($name), "\0").as_ptr().cast());
        if address.is_null() {
            return Err(format!("{} unavailable", stringify!($name)));
        }
        let $name = std::mem::transmute::<*mut c_void, $ty>(address);
    };
}

/// `renderer=…`, `vendor=…` and `draw_ms=…` lines, or why no GL context could render.
#[allow(non_snake_case)]
pub(super) fn probe() -> Result<String, String> {
    // SAFETY: C entry points of the system EGL library and the GLES2 functions it hands out with their documented signatures, called on one
    // thread in API order; the libraries outlive every call, and the process exits right after.
    unsafe {
        let egl = Library::new("libEGL.so.1").map_err(|e| format!("libEGL: {e}"))?;

        load!(egl, eglGetProcAddress: unsafe extern "C" fn(*const c_char) -> *mut c_void);
        load!(egl, eglQueryString: unsafe extern "C" fn(EglDisplay, i32) -> *const c_char);
        load!(egl, eglGetPlatformDisplay: unsafe extern "C" fn(u32, *mut c_void, *const isize) -> EglDisplay);
        load!(egl, eglGetDisplay: unsafe extern "C" fn(*mut c_void) -> EglDisplay);
        load!(egl, eglInitialize: unsafe extern "C" fn(EglDisplay, *mut i32, *mut i32) -> u32);
        load!(egl, eglBindAPI: unsafe extern "C" fn(u32) -> u32);
        load!(egl, eglChooseConfig: unsafe extern "C" fn(EglDisplay, *const i32, *mut EglConfig, i32, *mut i32) -> u32);
        load!(egl, eglCreateContext: unsafe extern "C" fn(EglDisplay, EglConfig, EglContext, *const i32) -> EglContext);
        load!(egl, eglCreatePbufferSurface: unsafe extern "C" fn(EglDisplay, EglConfig, *const i32) -> EglSurface);
        load!(egl, eglMakeCurrent: unsafe extern "C" fn(EglDisplay, EglSurface, EglSurface, EglContext) -> u32);
        // Drivers that crash on unload would kill the probe before it prints; the process exits right after anyway.
        std::mem::forget(egl);

        load_gl!(eglGetProcAddress, glGetString: unsafe extern "C" fn(u32) -> *const c_char);
        load_gl!(eglGetProcAddress, glGetError: unsafe extern "C" fn() -> u32);
        load_gl!(eglGetProcAddress, glCreateShader: unsafe extern "C" fn(u32) -> u32);
        load_gl!(eglGetProcAddress, glShaderSource: unsafe extern "C" fn(u32, i32, *const *const c_char, *const i32));
        load_gl!(eglGetProcAddress, glCompileShader: unsafe extern "C" fn(u32));
        load_gl!(eglGetProcAddress, glGetShaderiv: unsafe extern "C" fn(u32, u32, *mut i32));
        load_gl!(eglGetProcAddress, glCreateProgram: unsafe extern "C" fn() -> u32);
        load_gl!(eglGetProcAddress, glAttachShader: unsafe extern "C" fn(u32, u32));
        load_gl!(eglGetProcAddress, glBindAttribLocation: unsafe extern "C" fn(u32, u32, *const c_char));
        load_gl!(eglGetProcAddress, glLinkProgram: unsafe extern "C" fn(u32));
        load_gl!(eglGetProcAddress, glGetProgramiv: unsafe extern "C" fn(u32, u32, *mut i32));
        load_gl!(eglGetProcAddress, glUseProgram: unsafe extern "C" fn(u32));
        load_gl!(eglGetProcAddress, glGetUniformLocation: unsafe extern "C" fn(u32, *const c_char) -> i32);
        load_gl!(eglGetProcAddress, glUniform1f: unsafe extern "C" fn(i32, f32));
        load_gl!(eglGetProcAddress, glVertexAttribPointer: unsafe extern "C" fn(u32, i32, u32, u8, i32, *const c_void));
        load_gl!(eglGetProcAddress, glEnableVertexAttribArray: unsafe extern "C" fn(u32));
        load_gl!(eglGetProcAddress, glViewport: unsafe extern "C" fn(i32, i32, i32, i32));
        load_gl!(eglGetProcAddress, glEnable: unsafe extern "C" fn(u32));
        load_gl!(eglGetProcAddress, glBlendFunc: unsafe extern "C" fn(u32, u32));
        load_gl!(eglGetProcAddress, glDrawArrays: unsafe extern "C" fn(u32, i32, i32));
        load_gl!(eglGetProcAddress, glReadPixels: unsafe extern "C" fn(i32, i32, i32, i32, u32, u32, *mut c_void));
        load_gl!(eglGetProcAddress, glFinish: unsafe extern "C" fn());

        // Surfaceless picks the DRM render node the webview would, without needing a display server.
        let client_extensions = eglQueryString(null_mut(), EGL_EXTENSIONS);
        let surfaceless = !client_extensions.is_null()
            && CStr::from_ptr(client_extensions)
                .to_string_lossy()
                .split(' ')
                .any(|e| e == "EGL_MESA_platform_surfaceless");
        let display = if surfaceless {
            eglGetPlatformDisplay(
                EGL_PLATFORM_SURFACELESS_MESA,
                null_mut(),
                [EGL_NONE as isize].as_ptr(),
            )
        } else {
            eglGetDisplay(null_mut())
        };
        if display.is_null() {
            return Err("no EGL display".to_string());
        }
        let (mut major, mut minor) = (0, 0);
        if eglInitialize(display, &mut major, &mut minor) == 0 {
            return Err("eglInitialize failed".to_string());
        }
        if eglBindAPI(EGL_OPENGL_ES_API) == 0 {
            return Err("eglBindAPI failed".to_string());
        }
        let config_attribs = [
            EGL_SURFACE_TYPE,
            EGL_PBUFFER_BIT,
            EGL_RENDERABLE_TYPE,
            EGL_OPENGL_ES2_BIT,
            EGL_RED_SIZE,
            8,
            EGL_GREEN_SIZE,
            8,
            EGL_BLUE_SIZE,
            8,
            EGL_NONE,
        ];
        let mut config: EglConfig = null_mut();
        let mut config_count = 0;
        if eglChooseConfig(
            display,
            config_attribs.as_ptr(),
            &mut config,
            1,
            &mut config_count,
        ) == 0
            || config_count < 1
        {
            return Err("no pbuffer-capable GLES2 config".to_string());
        }
        let context = eglCreateContext(
            display,
            config,
            null_mut(),
            [EGL_CONTEXT_CLIENT_VERSION, 2, EGL_NONE].as_ptr(),
        );
        if context.is_null() {
            return Err("eglCreateContext failed".to_string());
        }
        let surface = eglCreatePbufferSurface(
            display,
            config,
            [EGL_WIDTH, SURFACE_SIZE, EGL_HEIGHT, SURFACE_SIZE, EGL_NONE].as_ptr(),
        );
        if surface.is_null() {
            return Err("eglCreatePbufferSurface failed".to_string());
        }
        if eglMakeCurrent(display, surface, surface, context) == 0 {
            return Err("eglMakeCurrent failed".to_string());
        }

        let gl_string = |name: u32| {
            let s = glGetString(name);
            if s.is_null() {
                String::new()
            } else {
                CStr::from_ptr(s)
                    .to_string_lossy()
                    .replace(['\r', '\n'], " ")
            }
        };
        let renderer = gl_string(GL_RENDERER);
        let vendor = gl_string(GL_VENDOR);

        let compile = |kind: u32, source: &CStr| -> Result<u32, String> {
            let shader = glCreateShader(kind);
            glShaderSource(shader, 1, &source.as_ptr(), null());
            glCompileShader(shader);
            let mut ok = 0;
            glGetShaderiv(shader, GL_COMPILE_STATUS, &mut ok);
            if ok == 0 {
                return Err(format!("shader {kind:#x} failed to compile"));
            }
            Ok(shader)
        };
        let program = glCreateProgram();
        glAttachShader(program, compile(GL_VERTEX_SHADER, VERTEX_SHADER)?);
        glAttachShader(program, compile(GL_FRAGMENT_SHADER, FRAGMENT_SHADER)?);
        glBindAttribLocation(program, 0, c"p".as_ptr());
        glLinkProgram(program);
        let mut linked = 0;
        glGetProgramiv(program, GL_LINK_STATUS, &mut linked);
        if linked == 0 {
            return Err("program failed to link".to_string());
        }
        glUseProgram(program);
        let seed = glGetUniformLocation(program, c"s".as_ptr());

        // One oversized triangle covers the viewport; blending chains the draws so none can be skipped.
        let triangle: [f32; 6] = [-1.0, -1.0, 3.0, -1.0, -1.0, 3.0];
        glVertexAttribPointer(0, 2, GL_FLOAT, 0, 0, triangle.as_ptr().cast());
        glEnableVertexAttribArray(0);
        glViewport(0, 0, SURFACE_SIZE, SURFACE_SIZE);
        glEnable(GL_BLEND);
        glBlendFunc(GL_ONE, GL_ONE);

        let mut pixel = [0u8; 4];
        let draw = |i: u32| {
            glUniform1f(seed, i as f32);
            glDrawArrays(GL_TRIANGLES, 0, 3);
        };
        let mut wait = || {
            glReadPixels(
                0,
                0,
                1,
                1,
                GL_RGBA,
                GL_UNSIGNED_BYTE,
                pixel.as_mut_ptr().cast(),
            );
            glFinish();
        };
        // Untimed first draw absorbs shader JIT and lazy driver setup.
        draw(0);
        wait();

        // One synced draw bails out slow rasterizers early; the rest go batched, as a GPU is best timed.
        let started = Instant::now();
        draw(1);
        wait();
        let mut draws = 1;
        if started.elapsed() <= DRAW_BUDGET {
            for i in 2..=TIMED_DRAWS {
                draw(i);
            }
            wait();
            draws = TIMED_DRAWS;
        }
        let draw_ms = started.elapsed().as_secs_f64() * 1000.0 / f64::from(draws);

        let error = glGetError();
        if error != GL_NO_ERROR {
            return Err(format!("GL error {error:#x} while drawing on {renderer:?}"));
        }
        Ok(format!(
            "renderer={renderer}\nvendor={vendor}\ndraw_ms={draw_ms:.3}"
        ))
    }
}
