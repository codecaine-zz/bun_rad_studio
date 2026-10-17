import { expect, test } from "bun:test";
import { createClickDemo } from "../examples/short_gui_events";

test("the Short's SimpleGUI example wires a click event that updates the label", () => {
  const win = createClickDemo();
  const spec = win.buildFormSpec();
  expect(spec.controls.find((control) => control.id === "status")?.text).toBe("Ready");
  expect(win.generateHtml()).toContain("Ready");
  const button = spec.controls.find((control) => control.text === "Click me");
  if (!button) throw new Error("The example has no button");
  const event = `${button.id}:onclick`;
  const handler = win.eventHandlersMap.get(event);
  if (!handler) throw new Error(`Missing click handler: ${event}`);
  handler(win);
  expect(win.getText("status")).toBe("It works!");
});
