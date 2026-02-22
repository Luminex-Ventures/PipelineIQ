import { Link } from 'react-router-dom';

export default function LegalPrivacy() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link to="/pricing" className="text-[#1e3a5f] font-medium hover:underline">
            ← Back to Luma-IQ
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
        <p className="text-gray-600">
          This is a placeholder. Replace with your privacy policy.
        </p>
      </main>
    </div>
  );
}
