import { Integrations } from '../Integrations';

/** Apps tab: existing provider grid + GitHub repository panel, chrome removed. */
export function AppsTab() {
  return (
    <div className="space-y-6">
      <Integrations embedded />
    </div>
  );
}
