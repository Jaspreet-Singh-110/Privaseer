# Email Sanitization System

Comprehensive privacy protection for forwarded emails through Privaseer's burner email system.

## Overview

All emails forwarded through burner addresses are automatically sanitized to remove tracking elements, protecting user privacy while maintaining email functionality.

## Features

### 1. Tracking Pixel Removal

Detects and removes invisible tracking pixels used to monitor email opens:

- **1x1 pixel images** - Common tracking technique
- **0x0 hidden images** - Alternative size tracking pixels
- **Display:none images** - CSS-hidden tracking elements
- **Visibility:hidden images** - CSS-invisible trackers

**Patterns Detected:**
```html
<!-- Removed -->
<img src="..." width="1" height="1">
<img src="..." style="display:none">
<img src="..." style="visibility:hidden">

<!-- Replaced with -->
<!-- tracking pixel removed -->
```

### 2. Remote Image Blocking

Blocks external images that can be used for tracking:

- **Tracking domains** - Known email tracking services
  - track.customer.io
  - click.mailchimp.com
  - sendgrid.net
  - mandrillapp.com
  - And 10+ other known trackers

- **Suspicious URLs** - Images with tracking indicators
  - URLs containing "track", "pixel", "beacon"
  - Open tracking endpoints
  - Transparent/spacer GIFs

**Transformation:**
```html
<!-- Original -->
<img src="https://example.com/image.jpg">

<!-- Sanitized -->
<img data-original-src="https://example.com/image.jpg"
     src=""
     alt="[Image blocked for privacy]">
```

### 3. UTM Parameter Removal

Strips tracking parameters from all links while preserving legitimate query strings:

**Removed Parameters:**
- `utm_source` - Campaign source tracking
- `utm_medium` - Medium tracking
- `utm_campaign` - Campaign name tracking
- `utm_term` - Keyword tracking
- `utm_content` - A/B test variant tracking
- `fbclid` - Facebook click identifier
- `gclid` - Google click identifier
- `msclkid` - Microsoft click identifier
- `mc_cid` - Mailchimp campaign ID
- `mc_eid` - Mailchimp email ID
- `_hsenc` - HubSpot encoding
- `_hsmi` - HubSpot message ID
- `mkt_tok` - Marketing token

**Example:**
```
Original: https://example.com/page?foo=bar&utm_source=email&utm_campaign=spring&baz=qux
Cleaned:  https://example.com/page?foo=bar&baz=qux
```

### 4. Email Beacon Removal

Detects and removes web beacons specifically designed for email tracking:

**Patterns:**
- `/open/` endpoints - Open tracking
- `/track/` endpoints - Click tracking
- `/beacon` paths - General beacons
- `?open` query parameters - URL-based tracking
- Common beacon filenames:
  - pixel.gif
  - spacer.gif
  - transparent.gif

### 5. Subject Line Sanitization

Removes tracking identifiers from email subjects:

- `[TRACK-12345]` patterns
- `{tracking_abc}` patterns
- Other tracking codes in brackets/braces

## Implementation

### Core Sanitizer (`email-sanitizer.ts`)

```typescript
import { sanitizeEmail, generateSanitizationReport, sanitizeSubject } from "./email-sanitizer.ts";

// Sanitize email content
const result = sanitizeEmail(htmlContent, textContent);

// Get stats
console.log(result.trackersRemoved.trackingPixels);
console.log(result.trackersRemoved.remoteImages);
console.log(result.trackersRemoved.trackingLinks);

// Generate user-facing report
const report = generateSanitizationReport(result);
```

### Integration in Forwarding

The `inbound-email` edge function automatically applies sanitization:

1. Email received via webhook
2. HTML and text content extracted
3. `sanitizeEmail()` processes both formats
4. Tracking stats recorded
5. Sanitized content forwarded to real email
6. Report appended to email body

## User Experience

### Email Footer

Sanitized emails include a privacy protection notice:

```
---
Privaseer Privacy Protection: Removed 3 tracking pixel(s),
2 remote image(s), 5 tracking parameter(s) from this email.
```

### Email Headers

Custom header added to forwarded emails:

```
X-Privaseer-Trackers-Removed: 10
```

### Database Logging

All sanitization actions are logged in `email_logs` table:

```sql
SELECT
  burner_email_id,
  from_address,
  subject,
  trackers_removed,
  received_at
FROM email_logs
ORDER BY received_at DESC;
```

## Technical Details

### HTML Processing

Uses regex patterns to detect and remove tracking elements:

1. **Pattern matching** - Multiple regex patterns for each tracker type
2. **Context preservation** - Maintains HTML structure
3. **URL cleaning** - Parses and rebuilds URLs without tracking params
4. **Safe replacement** - Replaces with comments or safe alternatives

### Text Processing

Sanitizes plain text versions:

1. **URL extraction** - Regex to find all URLs
2. **Parameter cleaning** - Removes tracking query strings
3. **Link preservation** - Maintains link functionality
4. **Context intact** - No disruption to surrounding text

### Performance

- **Regex compilation** - Patterns pre-compiled for efficiency
- **Single pass** - Most operations in one iteration
- **Minimal overhead** - <50ms processing time typical
- **Memory efficient** - Streaming where possible

## Statistics Tracking

### Counter Types

```typescript
interface TrackersRemoved {
  trackingPixels: number;    // Invisible pixels removed
  remoteImages: number;      // External images blocked
  trackingLinks: number;     // URLs with params cleaned
}
```

### Aggregation

Daily/weekly stats available via database queries:

```sql
-- Total trackers removed
SELECT SUM(trackers_removed) as total
FROM email_logs
WHERE received_at >= NOW() - INTERVAL '7 days';

-- Average per email
SELECT AVG(trackers_removed) as avg_per_email
FROM email_logs
WHERE forwarded = true;

-- By sender
SELECT
  from_address,
  COUNT(*) as email_count,
  SUM(trackers_removed) as total_trackers,
  AVG(trackers_removed) as avg_trackers
FROM email_logs
GROUP BY from_address
ORDER BY total_trackers DESC
LIMIT 20;
```

## Testing

Comprehensive test suite covers:

### Unit Tests

- 1x1 pixel detection
- Remote image blocking
- UTM parameter removal
- Email beacon detection
- Subject sanitization
- Report generation

### Integration Tests

- Full HTML email processing
- Mixed content (HTML + text)
- Multiple tracker types
- Edge cases and malformed input

### Test Execution

```bash
cd supabase/functions/inbound-email
deno test email-sanitizer.test.ts --allow-read
```

## Privacy Benefits

### For Users

1. **Open tracking prevention** - Senders can't tell if you read emails
2. **Click tracking removal** - Link clicks aren't tracked back to you
3. **Profiling protection** - Prevents behavioral tracking across sites
4. **Image loading control** - Remote images don't reveal your IP
5. **Campaign unlinking** - Email campaigns can't track conversion

### For Privacy

- No email metadata leaked to third parties
- IP address not exposed to image servers
- Browsing behavior not linkable to email opens
- Marketing attribution broken across channels

## Configuration

### Environment Variables

None required - sanitization is always active.

### Customization Options

To modify sanitization rules, edit `email-sanitizer.ts`:

```typescript
// Add tracking parameter
const TRACKING_PARAMS = [
  'utm_source',
  'custom_tracker',  // Add new param
];

// Add tracking domain
const TRACKING_DOMAINS = [
  'track.customer.io',
  'your-tracker.com',  // Add new domain
];
```

## Limitations

### What's NOT Sanitized

- **Data URLs** - Inline base64 images (considered safe)
- **Relative URLs** - Internal links without tracking
- **Required parameters** - Legitimate query strings preserved
- **Structural HTML** - Layout and styling maintained

### Known Edge Cases

1. **Obfuscated trackers** - Heavily encoded URLs may pass through
2. **Dynamic tracking** - JavaScript-based tracking (already blocked)
3. **Novel patterns** - New tracking techniques not yet catalogued

### False Positives

Minimal risk - legitimate content is preserved:
- Regular images with data-original-src can be viewed
- Non-tracking query parameters maintained
- Email structure and formatting intact

## Future Enhancements

### Planned Features

1. **Machine learning** - Pattern detection for unknown trackers
2. **Domain reputation** - Blocklist updates from community
3. **User preferences** - Configurable sanitization levels
4. **Link preview** - Safe preview of cleaned URLs
5. **Tracker database** - Crowdsourced tracker patterns

### Research Areas

- Zero-day tracker detection
- Encrypted tracking parameters
- Privacy-preserving analytics alternatives
- Email fingerprinting prevention

## Support

### Debugging

Enable detailed logging:

```typescript
console.log("Sanitization complete:", {
  trackingPixels: sanitized.trackersRemoved.trackingPixels,
  remoteImages: sanitized.trackersRemoved.remoteImages,
  trackingLinks: sanitized.trackersRemoved.trackingLinks,
});
```

### Common Issues

**Q: Legitimate images not showing?**
A: Images are blocked for privacy. Users can view via data-original-src attribute.

**Q: Links not working?**
A: Only tracking parameters removed. Core URL functionality preserved.

**Q: Email formatting broken?**
A: HTML structure maintained. Report rendering issues as bugs.

### Reporting Trackers

To report new tracking patterns:

1. Forward original email to support
2. Note sender and tracking method
3. Include email headers if possible
4. Describe expected vs actual behavior

## References

- [Email Tracking: A Reality Check](https://www.eff.org/deeplinks/2020/12/email-tracking-reality-check)
- [RFC 2822 - Internet Message Format](https://tools.ietf.org/html/rfc2822)
- [Privacy Badger's Approach](https://www.eff.org/privacybadger)
- [GDPR Email Tracking](https://gdpr.eu/email-encryption/)
