import type { HelpTips, SkipRule } from "../helpMatch";

/** Help tips for `color_studio`. Keys: see src/shared/helpTips.ts. Check with: bun run scripts/help_controls.ts <app file> --missing */
export const colorStudioTips: HelpTips = {
  "#dd_theme": "Change the colours of this window. Your choice is remembered.",
  "#btn_save_state": "Save the window size, theme and the two colours you entered so they are still here next time you open this app.",
  "#btn_center": "Move the window to the middle of the screen.",
  "#btn_fullscreen": "Fill the whole screen with this window. Press it again to go back.",
  "#txt_color_hex": "Your main (foreground) colour as a hex code (a colour written as # plus 3 or 6 letters and digits), for example #0284c7. It is the text colour in the contrast check and the base for every generator.",
  "#txt_bg_hex": "The background colour as a hex code, for example #0b0f19. Used in the contrast check and written into the CSS, Tailwind and TypeScript exports.",
  "#btn_analyze": "Check the two colours: contrast ratio (how well the text stands out from the background), WCAG accessibility pass or fail, and the RGB and HSL values of the primary colour. Shows a message if a code is not valid hex.",
  "#btn_swap": "Swap the primary and background colours with each other and re-run the check, to see the contrast the other way round.",
  "#btn_palette_shades": "List 11 shades of the primary colour, from 50 (lightest) to 950 (darkest), as HSL colours in the output box. Only the lightness changes; the hue stays the same.",
  "#btn_palette_comp": "Show the colours that go well with the primary: the complementary colour (opposite on the colour wheel) and two triadic colours (a third of the wheel apart). Written to the output box as HSL.",
  "#btn_export_css": "Write the colours as CSS variables (--color-primary and others) into the output box, and also save them to a file named design_tokens.css in the folder this app was started from. An existing file of that name is replaced.",
  "#btn_export_tailwind": "Write a Tailwind CSS config snippet (a brand colour and a surface colour) into the output box. Only shows the text; nothing is saved to a file, so copy it yourself.",
  "#btn_export_ts": "Write the colours as a TypeScript ThemeTokens constant into the output box. Only shows the text; nothing is saved to a file, so copy it yourself.",
  "#txt_tokens_output": "The palette or token code made by the buttons above. You can select, copy and edit it. Pressing another button replaces its content.",
  "#color_console": "A log of each analysis, palette and export. You cannot type here.",
};

/** Controls that need no tip, each with a reason. */
export const colorStudioSkip: SkipRule[] = [];
