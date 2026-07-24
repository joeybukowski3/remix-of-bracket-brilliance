import PgaHistoryModel from "./PgaHistoryModel";

/**
 * Route element for /pga. The "Latest PGA Articles" card used to be portalled
 * into the right sidebar from here; it is now rendered directly at the top of
 * the single left sidebar by PgaHistoryModel, so this stays as a thin,
 * route-stable wrapper.
 */
export default function PgaHistoryModelWithArticles() {
  return <PgaHistoryModel />;
}
