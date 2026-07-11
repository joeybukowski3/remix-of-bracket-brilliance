import { describe, expect, it } from "vitest";
import { makeNumerologyEmailMobileSafe } from "./mlb-numerology-email-mobile.mjs";

describe("makeNumerologyEmailMobileSafe", () => {
  it("makes the 680px shell fluid and stacks the wide summary table", () => {
    const input = `
      <table width="680" style="width:100%;max-width:680px;">
        <tr><td>
          <table width="100%">
            <tr><th>Player</th><th>Matchup</th><th>Score</th><th>Opposing Pitcher</th></tr>
            <tr>
              <td><table><tr><td>logo</td><td>Jackson Merrill</td></tr></table></td>
              <td>SD vs TOR</td>
              <td><span>74</span></td>
              <td><div>Trey Yesavage</div><div>xERA 3.1</div></td>
            </tr>
          </table>
        </td></tr>
      </table>`;

    const output = makeNumerologyEmailMobileSafe(input);

    expect(output).toContain('width="100%"');
    expect(output).not.toContain('width="680"');
    expect(output).not.toContain("<th>Player</th>");
    expect(output).toContain("Jackson Merrill");
    expect(output).toContain("SD vs TOR");
    expect(output).toContain("Opposing pitcher:");
    expect(output).toContain("Trey Yesavage");
    expect(output).toContain("table-layout:fixed");
    expect(output).toContain("word-break:normal");
  });
});
