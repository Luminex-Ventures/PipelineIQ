import { PageShell } from '../ui/PageShell';
import { PageHeader } from '../ui/PageHeader';
import { MessagingConnectionsSection } from '../components/integrations/MessagingConnectionsSection';
import { MarketingConnectionsSection } from '../components/integrations/MarketingConnectionsSection';

export default function IntegrationsPage() {
  const header = (
    <PageHeader
      label="Integrations"
      title="Connections"
      subtitle="Connect your email, SMS, and marketing accounts in one place. Manage everything from here."
    />
  );

  return (
    <PageShell title={header}>
      <div className="space-y-10 animate-fade-in">
        <MessagingConnectionsSection />
        <div className="border-t border-gray-200 pt-10">
          <MarketingConnectionsSection />
        </div>
      </div>
    </PageShell>
  );
}
