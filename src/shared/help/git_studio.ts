import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `git_studio`. Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const gitStudioTips: HelpTips = {
  "#dd_theme": "Change the colors of this window. Your choice is remembered.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#btn_save_state": "Remember what is in the boxes below, so it is still here next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#btn_refresh": "Read the Git repository again: the branch, the latest commit, the list of changed files and the last 25 commits. It works on the repository this app was started in.",
  "#txt_commit_msg": "The message that describes your commit, for example fix: correct the login redirect. Commit All Changes will not run while this is empty.",
  "#btn_commit": "Save a commit with the message on the left. If nothing is staged, it commits all changes to files Git already tracks; new files are left out. Nothing is sent to the remote until you push.",
  "#btn_stage_all": "Mark every change, including new and deleted files, to be part of the next commit (git add -A).",
  "#btn_unstage": "Take all changes out of the next commit again. Your files are not changed, only the staging list (git restore --staged .).",
  "#btn_view_diff": "Show in the box below the line-by-line changes you have made but not yet staged (git diff).",
  "#btn_view_staged": "Show in the box below the changes that are staged and will go into the next commit (git diff --staged).",
  "#btn_stash": "Put your uncommitted changes to tracked files aside and restore the last commit, so the folder is clean (git stash). New untracked files stay. Bring the changes back with Stash Pop.",
  "#btn_stash_pop": "Bring back the changes saved by the most recent Git Stash and remove that stash. If they clash with your files, Git reports a conflict in the log.",
  "#btn_git_pull": "Download new commits from the remote and put your own commits on top of them (git pull --rebase). The result appears in the log at the bottom.",
  "#btn_git_push": "Send your commits on the current branch to the remote repository (git push). It fails if the branch has no remote or the remote has newer commits.",
  "#txt_git_diff": "Shows the changed files, a diff, or the details of a commit you clicked in the history table. You can select and copy text from it.",
  "#git_console": "A log of every Git command this window ran, with its exit code (0 means success) and Git's own output.",
  "#tbl_commits": "The 25 latest commits. Click a row to see that commit's details in the box above.",
};

/** Controls that need no tip, each with a reason. */
export const gitStudioSkip: SkipRule[] = [];
