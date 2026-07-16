import { ViewInfo } from "../models/interfaces";
import { getViewTypeLabel, getViewTypeTone } from "../models/viewTypes";

export function ViewTypeBadge({ view }: { view: Pick<ViewInfo, "querytype" | "isDefault" | "isPersonal"> }) {
    return <span className={`view-badge view-badge-${getViewTypeTone(view)}`}>{getViewTypeLabel(view)}</span>;
}
