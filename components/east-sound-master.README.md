# EastSound Compliance & Royalty Studio

A comprehensive broadcast monitoring, licensing, and royalty management system for Uganda's radio stations, built for the UPRS (Uganda Performing Right Society) regulatory framework.

## Features

### 1. Role-Based Access Control
- **CMO_ADMIN**: Full access to all features including licensing calculator, infringement radar, analytics, and catalog management
- **ARTIST_LABEL**: Access to catalog portal, track management, and royalty tracking
- **BROADCASTER**: Access to compliance status, invoicing, and airplay monitoring

### 2. Tiered Licensing Calculator
- Real-time calculation of statutory blanket base fees
- Per-spin tariff allocations based on station tier
- Support for National, Regional, and Community station classifications
- Automatic tier determination based on station reach
- Export functionality for billing statements

### 3. Infringement Detection Radar
- Real-time monitoring of unlicensed broadcasts
- Severity classification (HIGH, MEDIUM, LOW)
- Automated cease & desist notice generation
- Case resolution tracking
- CSV export for infringement reports

### 4. Analytics Dashboard
- Regional spin distribution visualization
- Monthly royalty trend analysis
- Station tier distribution breakdown
- Performance metrics and KPIs
- Historical data comparison

### 5. Artist & Label Catalog Management
- ISRC-based track registration
- Airplay spin tracking
- Royalty estimation and accrual
- Artist collaboration management
- Genre classification
- Release date tracking

### 6. Broadcaster Compliance Portal
- Station licensing status monitoring
- Real-time airplay logging
- Compliance scoring system
- Payment history tracking
- Invoice generation and management

### 7. Alert System
- Real-time notifications for infringements
- Compliance deadline reminders
- Payment processing alerts
- System status notifications

## Technical Implementation

### Dependencies
- React 19+ with TypeScript
- Next.js 16+
- Lucide React for icons
- Tailwind CSS for styling
- Recharts for data visualization (available in project)

### API Integration
The component integrates with existing BMAT API endpoints:
- `/api/stations` - Station registry and metadata
- `/api/tracks` - Catalog and airplay data
- `/api/royalties` - Royalty calculations and statements

### Data Types

#### Station Billing
```typescript
type StationTier = 'Tier 1' | 'Tier 2' | 'Tier 3' | 'National' | 'Regional' | 'Community';
type StationStatus = 'ACTIVE' | 'UNLICENSED' | 'PENDING' | 'SUSPENDED';

interface StationBilling {
  id: string;
  name: string;
  region: string;
  location: string;
  frequency: string;
  tier: StationTier;
  baseFee: number;
  perSpinRate: number;
  trackedSpins: number;
  status: StationStatus;
  reach: number;
  lastReport: string;
  complianceScore: number;
}
```

#### Track
```typescript
interface Track {
  id: string;
  isrc: string;
  title: string;
  primaryArtist: string;
  featuredArtists: string[];
  duration: number;
  genre: string;
  releaseDate: string;
  plays: number;
  stations: string[];
}
```

#### Infringement
```typescript
interface Infringement {
  id: string;
  stationId: string;
  stationName: string;
  region: string;
  unlicensedSpins: number;
  detectedAt: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'RESOLVED' | 'ESCALATED';
  evidence: string[];
}
```

## Usage

### Basic Implementation
```tsx
import EastSoundMasterModule from '@/components/east-sound-master';

function DashboardPage() {
  return <EastSoundMasterModule />;
}
```

### With Custom Data
The component automatically fetches data from the BMAT API endpoints. For custom implementations, you can modify the data fetching logic in the component.

## UI/UX Features

### Design System
- Dark theme optimized for long working sessions
- Color-coded status indicators
- Responsive design for mobile and desktop
- Smooth animations and transitions
- Accessible keyboard navigation

### Color Coding
- **Emerald**: Active, compliant, positive status
- **Rose**: Infringements, warnings, critical issues
- **Amber**: Pending, warnings, attention required
- **Sky Blue**: Information, primary actions
- **Purple**: Analytics, insights
- **Cyan**: Catalog, artist-related items

### Interactive Elements
- Search and filter capabilities
- Sortable tables
- Export functionality (CSV)
- Real-time updates
- Hover effects and tooltips

## Compliance Features

### Uganda Copyright Act (2006) Compliance
- Automatic detection of unlicensed broadcasts
- Statutory notice generation
- Evidence collection and management
- Case tracking and resolution

### UPRS Tariff Integration
- Flat-rate per-play tariffs
- Tier-based base fees
- Regional pricing adjustments
- Currency conversion (UGX/USD)

## Performance Considerations

### Optimization
- Memoized calculations and filtering
- Efficient data fetching with caching
- Responsive table rendering
- Lazy loading for large datasets

### Data Handling
- Real-time data synchronization
- Error handling and recovery
- Loading states and skeleton screens
- Empty state handling

## Security Considerations

### Role-Based Permissions
- Strict role separation
- Feature access control
- Data visibility restrictions
- Action permissions

### Data Protection
- No sensitive data storage in client state
- API-based data access
- Secure data transmission
- Privacy-compliant data handling

## Future Enhancements

### Planned Features
1. **Real-time WebSocket Integration** for live monitoring
2. **Advanced Analytics** with machine learning predictions
3. **Mobile Application** for field monitoring
4. **Integration with UPRS Systems** for automated reporting
5. **Blockchain-based Royalty Tracking** for transparency
6. **AI-powered Infringement Detection** for improved accuracy
7. **Multi-country Support** for regional expansion

### Technical Improvements
1. **Server-side Rendering** for better SEO
2. **Progressive Web App** capabilities
3. **Offline Mode** for field operations
4. **Advanced Caching** for better performance
5. **Internationalization** for multi-language support

## Installation

### Dependencies
```bash
npm install lucide-react
```

### Component Placement
Place the component in `/components/east-sound-master.tsx` and import it in your pages.

## Configuration

### Environment Variables
No specific environment variables required. The component uses the existing BMAT API endpoints.

### Customization
You can customize the following:
- Color themes in Tailwind CSS
- Tariff rates in the configuration objects
- Tier thresholds and classifications
- Alert thresholds and notifications

## Troubleshooting

### Common Issues
1. **Missing Icons**: Ensure `lucide-react` is installed
2. **API Errors**: Verify API endpoints are available and returning correct data
3. **TypeScript Errors**: Check for type mismatches in data interfaces
4. **Styling Issues**: Ensure Tailwind CSS is properly configured

### Debugging
- Use browser developer tools to inspect network requests
- Check console for errors and warnings
- Verify data types and structures
- Test with mock data for isolation

## Support

For issues, questions, or feature requests, please refer to the main BMAT repository documentation or open an issue.

## License

This component is part of the BMAT project and follows the same licensing terms.

---

**Version**: 1.0.0  
**Last Updated**: 2026-09-06  
**Maintainer**: BMAT Development Team  
**Repository**: [mikeo-ne/BMAT](https://github.com/mikeo-ne/BMAT)