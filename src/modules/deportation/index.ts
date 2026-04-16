import { registerModule } from "../registry";
import { DeportationModule } from "./DeportationModule";
import DeportationModuleNode from "./DeportationModuleNode";

// Per-field output handles. The module exposes three families:
//   aggregate (totals), rate (per-day/-hour/-minute), and geographic
//   breakdowns (by region and by ICE field office).
// Handle ids use the `out-<field>` convention so translators auto-pick the
// right field when patched.
const DEPORTATION_OUTPUTS: Array<{ id: string; label: string }> = [
  { id: "out-all",                    label: "ALL" },
  // Aggregate
  { id: "out-total_removals",         label: "Removals" },
  { id: "out-total_arrests",          label: "Arrests" },
  { id: "out-current_detained",       label: "Detained" },
  // Rate
  { id: "out-per_day",                label: "Per Day" },
  { id: "out-per_hour",               label: "Per Hour" },
  { id: "out-per_minute",             label: "Per Min" },
  // Regions
  { id: "out-region_mexico",          label: "Mexico" },
  { id: "out-region_central_america", label: "C. America" },
  { id: "out-region_caribbean",       label: "Caribbean" },
  { id: "out-region_south_america",   label: "S. America" },
  { id: "out-region_asia",            label: "Asia" },
  { id: "out-region_africa",          label: "Africa" },
  { id: "out-region_europe",          label: "Europe" },
  // Offices
  { id: "out-office_phoenix",         label: "Phoenix" },
  { id: "out-office_san_antonio",     label: "San Antonio" },
  { id: "out-office_houston",         label: "Houston" },
  { id: "out-office_dallas",          label: "Dallas" },
  { id: "out-office_chicago",         label: "Chicago" },
  { id: "out-office_miami",           label: "Miami" },
  { id: "out-office_el_paso",         label: "El Paso" },
  { id: "out-office_newark",          label: "Newark" },
];

registerModule({
  type: "deportation",
  category: "source",
  label: "Deportation Tracker",
  hasInput: false,
  hasOutput: true,
  outputHandles: () => DEPORTATION_OUTPUTS,
  defaultData: () => ({}),
  createAudio: (ctx) => new DeportationModule(ctx),
  component: DeportationModuleNode,
});
