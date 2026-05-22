# Teleman v1.1.10 - Android/Termux PIE Compatibility Hotfix

This release introduces a critical hotfix for Linux/Android environments (such as Termux on ARM64) to resolve binary execution failures.

## 🛠 Fixes & Under the Hood Cleanups

### Android/Termux Position-Independent Executable (PIE) Support
* **ELF Linker Compatibility:** Fixed the `unexpected e_type: 2` error on Termux/Android systems by compiling all Linux releases (`linux/amd64` and `linux/arm64`) as Position Independent Executables (`-buildmode=pie`). This satisfies Android's strict linker requirements (introduced in API 21) while retaining complete backward and forward compatibility with standard x86_64 and arm64 Linux distributions.
