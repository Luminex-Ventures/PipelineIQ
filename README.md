# Real Estate Pipeline Management

A full-stack web application for real estate agents to track their pipeline, lead sources, commissions, and yearly performance.

## Features

### Core Functionality
- **Deal Pipeline Management**: Visual Kanban board with drag-and-drop to move deals through stages
- **CSV Import/Export**: Bulk import deals from CSV files with validation and error reporting
- **Lead Source Tracking**: Create and manage custom lead sources with categories and brokerage splits
- **Commission Calculations**: Automatic calculation of gross commission, brokerage splits, referral fees, and net income
- **Annual Analytics**: Comprehensive reporting with charts and metrics by year
- **Task Management**: Add and track follow-up tasks for each deal
- **User Settings**: Configure annual GCI goals, tax rates, and default brokerage splits
- **Role-Based Access Control**: Multi-level user roles (Agent, Team Lead, Sales Manager, Admin)
- **Team Hierarchy**: Organize agents into teams with team-level analytics
- **Luma AI Assistant**: AI-powered assistant with RAG for querying deals, metrics, and performance data

### Deal Types
- Buyer
- Seller
- Buyer & Seller (dual representation)
- Renter
- Landlord

### Deal Stages
- New Lead
- Contacted
- Showing Scheduled
- Offer Submitted
- Under Contract
- Pending
- Closed
- Dead

### Analytics & Reports
- Year-to-date sales volume and GCI
- Closed deals count by buyer/seller type
- Lead source performance with conversion rates
- Monthly GCI trend charts
- Commission breakdown by lead source
- Annual goal progress tracking

## Tech Stack

### Frontend
- React 18 with TypeScript
- Tailwind CSS for styling
- Recharts for data visualization
- DnD Kit for drag-and-drop functionality
- Lucide React for icons

### Backend
- Supabase (PostgreSQL database)
- Supabase Auth (email/password authentication)
- Row Level Security (RLS) for data protection
- Auto-generated REST APIs

## Database Schema

### Tables

**lead_sources**
- Track lead origins (Zillow, referrals, open houses, etc.)
- Categorized by type (online, referral, event, farming, etc.)
- Per-source brokerage split rates

**deals**
- Complete deal information (client, property, financial details)
- Deal type (buyer, seller, both, renter, landlord)
- Pipeline status tracking with stage history
- Commission structure (gross rate, brokerage split, referral fees, transaction fees)
- Expected and actual sale prices

**tasks**
- Follow-up tasks associated with deals
- Due dates and completion tracking

**user_settings**
- Annual GCI goals
- Default tax rate
- Default brokerage split rate
- Global role (agent, team_lead, sales_manager, admin)

**teams**
- Team organization and hierarchy
- Team name and metadata

**user_teams**
- Many-to-many relationship between users and teams
- Per-team role assignment (agent, team_lead)

## Installation

### Prerequisites
- Node.js 18+ and npm
- A Supabase account (free tier available)

### Setup Steps

1. **Clone and Install**
   ```bash
   npm install
   ```

2. **Environment Variables**

   Copy the provided example file and fill in your Supabase project details:
   ```bash
   cp .env.example .env
   ```
   Update the copied file with your project's `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.\
   Without these values the development server will render a blank screen because the Supabase client cannot initialize.

3. **Database Setup**

   The database schema has been automatically created via Supabase migrations. The following tables are ready:
   - lead_sources
   - deals
   - tasks
   - user_settings

   All tables have Row Level Security (RLS) enabled to protect user data.

4. **Run Development Server**
   ```bash
   npm run dev
   ```

5. **Build for Production**
   ```bash
   npm run build
   ```

### Luma AI (OpenAI) Setup

The `luma-insights` edge function calls OpenAI. Provide your own API key via Supabase secrets before deploying:

```bash
# from the repo root
npx supabase@latest secrets set OPENAI_API_KEY=sk-... --project-ref <your-project-ref>
npx supabase@latest functions deploy luma-insights --project-ref <your-project-ref>
```

If the secret is missing, the function responds with `OPENAI_API_KEY is not configured` and the dashboard cannot show AI insights.

## Roles & Team Hierarchy

### User Roles

The system supports four role levels with increasing visibility and permissions:

**Agent**
- Can only view and manage their own deals
- Access to personal analytics and performance metrics
- Cannot see other team members' deals

**Team Lead**
- Can view all deals for users in their team
- Access to team-level aggregated analytics
- Can still view their own personal analytics separately
- Cannot manage users outside their team

**Sales Manager**
- Can view all deals across all teams in the organization
- Access to organization-wide analytics
- Can see performance metrics for all teams and agents
- Cross-team visibility for strategic oversight

**Admin**
- Full system-wide access to all data and settings
- Can manage teams and user assignments
- Can configure system-wide settings
- Complete control over all aspects of the application

### Authorization Rules

The system implements strict role-based access control (RBAC):

- All database queries are filtered by visible user IDs based on role
- Row Level Security (RLS) policies enforce permissions at the database level
- API endpoints respect role-based visibility automatically
- Frontend UI adapts based on user's role (showing/hiding team features)

### Team Management

- Teams are created and managed by Admins
- Users can belong to one team (v1 implementation)
- Team Leads can view aggregated metrics for their team
- Sales Managers can compare performance across teams

## Luma AI Assistant

### Overview

Luma is an AI-powered assistant that helps you query and understand your pipeline data using natural language. It uses Retrieval-Augmented Generation (RAG) to provide accurate answers based on your actual deal data.

### Key Features

- **Natural Language Queries**: Ask questions in plain English
- **Role-Based Access**: Only sees data you're authorized to view
- **Real-Time Analysis**: Queries live data from your pipeline
- **Supporting Data Cards**: Visual metrics accompany text responses
- **Conversation History**: See previous queries in chat format

### Example Queries

**Personal Performance:**
- "What is my total GCI this year?"
- "How many deals have I closed?"
- "Which lead source performs best?"
- "Show me all deals under contract"

**Pipeline Management:**
- "Summarize my pipeline health"
- "Which deals are expected to close this month?"
- "What's my conversion rate?"

**Team Analytics (Team Leads+):**
- "Summarize my team's performance this quarter"
- "Which agent has the highest GCI?"
- "How many deals has my team closed?"

### How It Works

1. **Query Understanding**: Luma analyzes your question to determine what data you need
2. **Data Retrieval**: Fetches relevant deals, metrics, and analytics from the database
3. **Context Building**: Aggregates and summarizes the data while respecting your role permissions
4. **Response Generation**: Provides a clear answer with supporting metrics
5. **Visual Display**: Shows key numbers in easy-to-read stat cards

### Supported Query Types

- **Metrics Queries**: GCI, deal counts, volume, averages
- **Deal Listings**: Find specific deals by status, lead source, or date
- **Lead Source Performance**: Compare effectiveness of different lead sources
- **Pipeline Health**: Get an overview of active deals and their status
- **Team Performance**: View team-wide statistics (for Team Leads and above)

## CSV Import Feature

### Overview

The CSV import feature allows you to bulk import deals from a spreadsheet, saving time when migrating from another system or adding multiple deals at once.

### How to Import Deals

1. **Access Import**: Click the "Import CSV" button on the Pipeline page
2. **Download Example**: Click "Download Example CSV" to get a properly formatted template
3. **Prepare Your Data**: Fill in your deal data following the example format
4. **Upload**: Upload your completed CSV file
5. **Review Results**: See which deals were successfully imported and any errors

### CSV Format

The CSV file must include the following columns:

**Required Fields:**
- `client_name` - Full name of the client
- `property_address` - Street address of the property
- `deal_type` - One of: buyer, seller, buyer_and_seller, renter, landlord
- `status` - One of: new_lead, contacted, showing_scheduled, offer_submitted, under_contract, pending, closed, dead
- `expected_sale_price` - Expected price (number without commas or dollar signs)

**Optional Fields:**
- `client_phone` - Phone number
- `client_email` - Email address
- `city` - City name
- `state` - State abbreviation (e.g., TX, CA)
- `zip` - Zip code
- `lead_source_name` - Name of existing lead source (must match exactly)
- `actual_sale_price` - Actual sale price for closed deals
- `gross_commission_rate` - Commission rate as decimal (e.g., 0.03 for 3%)
- `brokerage_split_rate` - Brokerage split as decimal (e.g., 0.20 for 20%)
- `referral_out_rate` - Referral out rate as decimal
- `referral_in_rate` - Referral in rate as decimal
- `transaction_fee` - Transaction fee amount

### Example CSV

```csv
client_name,client_phone,client_email,property_address,city,state,zip,deal_type,lead_source_name,status,expected_sale_price,gross_commission_rate,brokerage_split_rate,transaction_fee
John Smith,555-123-4567,john@example.com,123 Main St,Austin,TX,78701,buyer,Zillow,under_contract,450000,0.03,0.20,500
Sarah Johnson,555-987-6543,sarah@example.com,456 Oak Ave,Dallas,TX,75201,seller,Past Client,closed,525000,0.03,0.20,500
```

### Import Validation

The system validates each row and provides detailed error messages:
- **Valid rows**: Imported successfully
- **Invalid rows**: Skipped with specific error messages
- **Unknown lead sources**: Deal created without lead source assignment

### Notes

- Deals are imported for the current user only
- Lead source names must match existing lead sources exactly (case-insensitive)
- If `gross_commission_rate` is not provided, defaults to 3%
- If `brokerage_split_rate` is not provided, uses your default setting
- Closed deals automatically get a `closed_at` timestamp
- All deals get a `stage_entered_at` timestamp for tracking

## Usage

### Getting Started

1. **Sign Up**: Create a new account with email and password
2. **Configure Settings**: Set your annual GCI goal, tax rate, and brokerage split
3. **Add Lead Sources**: Create lead sources like "Zillow", "Past Client", "Open House" with their brokerage splits
4. **Create Deals**: Add deals manually or import from CSV
5. **Manage Pipeline**: Drag deals between stages as they progress
6. **Track Analytics**: View performance metrics and charts
7. **Ask Luma**: Use the AI assistant to query your data and get insights

### Commission Calculation Logic

For each deal, the net commission is calculated as:

1. **Gross Commission** = Sale Price × Commission Rate
2. **After Brokerage Split** = Gross Commission × (1 - Brokerage Split Rate)
3. **After Referral Out** = After Brokerage Split × (1 - Referral Out Rate) *(if applicable)*
4. **After Referral In** = After Referral Out × (1 + Referral In Rate) *(if applicable)*
5. **Net to Agent** = After Referrals - Transaction Fee

Example (assuming $500,000 sale, 3% commission, 20% brokerage split, $500 transaction fee):
- Gross Commission: $15,000
- After 80/20 Split: $12,000
- Net to Agent: $11,500

### Pipeline Forecast

The system automatically calculates expected future GCI based on deals in the pipeline using probability weights:
- New Lead: 10%
- Contacted: 20%
- Showing Scheduled: 35%
- Offer Submitted: 60%
- Under Contract: 80%
- Pending: 90%

### Default Values

**User Settings Defaults:**
- Annual GCI Goal: $0
- Tax Rate: 25%
- Brokerage Split: 20% (80/20 split)

**Deal Defaults:**
- Commission Rate: 3%
- Brokerage Split: 20%
- Transaction Fee: $0

## Security

- Authentication via Supabase Auth
- Row Level Security (RLS) ensures users only access their own data
- All database operations secured with RLS policies
- Passwords securely hashed
- JWT-based session management

## File Structure

```
src/
├── components/
│   ├── DealCard.tsx            # Deal card component for pipeline
│   ├── DealModal.tsx           # Deal creation/editing modal
│   ├── ImportDealsModal.tsx    # CSV import modal with validation
│   ├── Layout.tsx              # Main layout with navigation
│   └── PipelineColumn.tsx      # Pipeline column component
├── contexts/
│   └── AuthContext.tsx         # Authentication context with role info
├── lib/
│   ├── csv-utils.ts            # CSV parsing, validation, and generation
│   ├── database.types.ts       # TypeScript types for database
│   ├── rbac.ts                 # Role-based access control utilities
│   └── supabase.ts             # Supabase client configuration
├── pages/
│   ├── Analytics.tsx          # Analytics and reports page
│   ├── Dashboard.tsx          # Main dashboard with stats
│   ├── LeadSources.tsx        # Lead source management
│   ├── Login.tsx              # Login page
│   ├── Luma.tsx               # AI assistant chat interface
│   ├── Pipeline.tsx           # Kanban pipeline board
│   ├── Settings.tsx           # User settings page
│   └── Signup.tsx             # Signup page
├── App.tsx                    # Main app component with routing
└── main.tsx                   # Application entry point

supabase/functions/
└── luma-query/
    └── index.ts               # Luma AI assistant edge function
```

## Future Enhancements

Potential features to add:
- Email reminders for tasks
- Document upload for deals with vector embeddings for Luma
- Client portal for updates
- Mobile app version
- Enhanced team collaboration features
- Integration with MLS systems
- Automated lead import from various sources
- SMS notifications
- Calendar integration
- Advanced reporting and exports
- Enhanced Luma capabilities with external LLM providers (OpenAI, Claude, etc.)
- Document analysis and summarization through Luma
- Team performance leaderboards
- Role-based dashboard customization

## License

MIT License - feel free to use this for your real estate business!

## Support

For issues or questions, please open an issue in the repository.
