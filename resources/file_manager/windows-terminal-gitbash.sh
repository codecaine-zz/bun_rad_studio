# Git Bash (or another MSYS bash) inside the File Manager's terminal: the usual start-up files of a login shell, then
# a prompt hook that tells the File Manager which folder the shell is in.
if [ -r /etc/profile ]; then . /etc/profile; fi
if [ -r "$HOME/.bash_profile" ]; then . "$HOME/.bash_profile"
elif [ -r "$HOME/.bash_login" ]; then . "$HOME/.bash_login"
elif [ -r "$HOME/.profile" ]; then . "$HOME/.profile"
elif [ -r "$HOME/.bashrc" ]; then . "$HOME/.bashrc"
fi
__file_manager_cwd() {
    local status=$? folder
    folder=$(cygpath -w "$PWD" 2>/dev/null) || return "$status"
    printf '\033]777;file-manager-cwd;%s;gitbash\007' "$(printf '%s' "$folder" | base64 -w0)"
    return "$status"
}
PROMPT_COMMAND="__file_manager_cwd${PROMPT_COMMAND:+; $PROMPT_COMMAND}"
