/** Shared by Linux release installers; ROOT must be the extracted archive's physical path. */
export function linuxSandboxSetup(profileName: string, executable: string): string {
  return `PROFILE="/etc/apparmor.d/${profileName}"
APPARMOR=0
UNINSTALL=0
for arg in "$@"; do
  case "$arg" in
    --apparmor) APPARMOR=1 ;;
    --uninstall) UNINSTALL=1 ;;
    *) echo "Usage: sh install.sh [--apparmor] [--uninstall]" >&2; exit 1 ;;
  esac
done
if [ "$APPARMOR" = 1 ]; then
  PARSER="$(command -v apparmor_parser || true)"
  if [ -z "$PARSER" ] && [ -x /usr/sbin/apparmor_parser ]; then PARSER=/usr/sbin/apparmor_parser; fi
  if [ -z "$PARSER" ]; then
    echo "AppArmor tools not found. On Ubuntu, install them with: sudo apt install apparmor" >&2
    exit 1
  fi
  if [ "$UNINSTALL" = 1 ]; then
    if [ -f "$PROFILE" ]; then
      sudo "$PARSER" -R "$PROFILE"
      sudo rm -f "$PROFILE"
    fi
  else
    # Reject AppArmor pattern and quoting characters so the permission stays executable-specific.
    if ! printf '%s\\n' "$ROOT" | LC_ALL=C grep -Eq '^/[a-zA-Z0-9_./ +@=-]+$' || [ "$(printf '%s' "$ROOT" | wc -l)" -ne 0 ]; then
      echo "For AppArmor, move the download to a path containing only letters, numbers, spaces or _ . / + @ = - and try again." >&2
      exit 1
    fi
    if [ ! -x "$ROOT/${executable}" ]; then
      echo "Missing executable. Extract the whole archive before installing." >&2
      exit 1
    fi
    TMP_PROFILE="$(mktemp)"
    trap 'rm -f "$TMP_PROFILE"' EXIT HUP INT TERM
    cat > "$TMP_PROFILE" <<EOF
abi <abi/4.0>,
include <tunables/global>

profile ${profileName} "$ROOT/${executable}" flags=(unconfined) {
  userns,
}
EOF
    "$PARSER" --skip-kernel-load --skip-cache "$TMP_PROFILE"
    echo "Installing an executable-specific AppArmor user-namespace permission (sudo required)."
    sudo install -m 644 "$TMP_PROFILE" "$PROFILE"
    sudo "$PARSER" -r "$PROFILE"
    echo "AppArmor profile loaded. Rerun sh install.sh --apparmor if you move this folder."
  fi
elif [ "$UNINSTALL" = 1 ] && [ -f "$PROFILE" ]; then
  echo "To also remove the AppArmor profile, run: sh install.sh --uninstall --apparmor"
fi
`;
}

export const LINUX_SANDBOX_WARNING = `if [ "$APPARMOR" = 0 ] && [ -r /proc/sys/kernel/apparmor_restrict_unprivileged_userns ] && [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns)" = 1 ]; then
  echo "Ubuntu restricts sandbox user namespaces. If a native window does not open, run: sh install.sh --apparmor"
fi
`;
