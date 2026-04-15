import { registerModule } from "../registry";
import { USDebtModule } from "./USDebtModule";
import USDebtModuleNode from "./USDebtModuleNode";

const DEBT_OUTPUTS: Array<{ id: string; label: string }> = [
  { id: "out-all",             label: "ALL" },
  { id: "out-total_debt",      label: "Total" },
  { id: "out-per_citizen",     label: "Per Cit." },
  { id: "out-per_taxpayer",    label: "Per Tax." },
  { id: "out-growth_rate",     label: "Rate/s" },
  { id: "out-annual_interest", label: "Interest" },
  { id: "out-debt_to_gdp",     label: "Debt/GDP" },
];

registerModule({
  type: "us-debt",
  category: "source",
  label: "US Debt",
  hasInput: false,
  hasOutput: true,
  outputHandles: () => DEBT_OUTPUTS,
  defaultData: () => ({}),
  createAudio: (ctx) => new USDebtModule(ctx),
  component: USDebtModuleNode,
});
