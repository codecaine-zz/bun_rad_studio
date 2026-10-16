#!/bin/sh
# This script arrives on stdin; the interactive shell must read from the terminal instead.
if [ "${SHELL##*/}" != bash ]; then
    printf 'File Manager folder following in WSL requires Bash; starting %s without tracking.\n' "$SHELL" >&2
    exec "${SHELL:-/bin/sh}" -i </dev/tty
fi

exec "$SHELL" --rcfile /dev/fd/3 -i 3<<'BASHRC' </dev/tty
if [ -r "$HOME/.bashrc" ]; then . "$HOME/.bashrc"; fi
__file_manager_cwd() {
    local status=$? folder encoded meta
    folder=$(wslpath -w -- "$PWD") || {
        printf 'File Manager could not translate the WSL folder: %s\n' "$PWD" >&2
        return "$status"
    }
    encoded=$(printf '%s' "$folder" | base64 -w0) || return "$status"
    # The distro and where Windows drives are mounted let pasted Windows paths become Linux ones.
    meta=$(printf '%s\n%s' "${WSL_DISTRO_NAME:-}" "$(wslpath -u 'C:\' 2>/dev/null | sed 's#c/*$##')" | base64 -w0) || meta=
    printf '\033]777;file-manager-cwd;%s;wsl;%s\007' "$encoded" "$meta"
    return "$status"
}
PROMPT_COMMAND+=(__file_manager_cwd)
BASHRC
