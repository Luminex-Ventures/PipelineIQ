import { PageShell } from '../ui/PageShell';
import { PageHeader } from '../ui/PageHeader';
import { PropertyValuationForm } from '../components/market-intelligence/PropertyValuationForm';

export default function PropertyValuationPage() {
  const headerTitle = (
    <PageHeader
      label="Property Valuation"
      title="Data-driven value estimate with comps"
      subtitle="Enter an address and property details for a price range, comparable sales, and a shareable report."
    />
  );

  return (
    <PageShell title={headerTitle}>
      <div className="animate-fade-in">
        <PropertyValuationForm />
      </div>
    </PageShell>
  );
}
