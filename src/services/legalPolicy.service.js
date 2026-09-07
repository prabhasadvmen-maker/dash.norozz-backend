import { LegalPolicy } from '../models/legalPolicy.model.js';
import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

const DEFAULT_POLICIES = {
  customer_privacy_policy: {
    targetApp: 'customer',
    type: 'privacy_policy',
    title: 'Customer Privacy Policy',
    version: 'v1.0',
    content: `<h2>NOROZZ Customer Privacy Policy</h2>
<p>Last updated: September 2026 | Version v1.0</p>
<hr>
<h3>1. Information We Collect</h3>
<p>At <strong>NOROZZ</strong>, we take your privacy seriously. We collect personal details such as your name, email address, phone number, and delivery location to connect you with verified service technicians in your area.</p>

<h3>2. How We Use Your Information</h3>
<ul>
  <li>To process and dispatch your multi-service booking requests seamlessly.</li>
  <li>To notify you about live partner tracking, dispatch updates, and OTP confirmations.</li>
  <li>To provide customer support and handle any refund or booking dispute resolution.</li>
</ul>

<h3>3. Data Protection & Security</h3>
<p>All sensitive communications are encrypted end-to-end. We do not sell or rent your personal information to third-party advertisers under any circumstances.</p>

<h3>4. Contact Us</h3>
<p>If you have any questions regarding your personal privacy, please reach out to our Support Helpdesk at <strong>privacy@norozz.com</strong>.</p>`
  },
  customer_terms_and_conditions: {
    targetApp: 'customer',
    type: 'terms_and_conditions',
    title: 'Customer Terms & Conditions',
    version: 'v1.0',
    content: `<h2>NOROZZ Customer Terms & Conditions</h2>
<p>Last updated: September 2026 | Version v1.0</p>
<hr>
<h3>1. Acceptance of Terms</h3>
<p>By creating an account or using the <strong>NOROZZ Enterprise Multi-Service Platform</strong>, you agree to comply with all terms and conditions set forth herein.</p>

<h3>2. Booking & Payment Policy</h3>
<ul>
  <li>Bookings must be paid via approved payment channels (Cards, UPI, NOROZZ Wallet, or COD where applicable).</li>
  <li>Cancellation is free up to 2 hours before scheduled slot. Late cancellations may incur nominal platform cancellation charges.</li>
  <li>OTP verification is required before partner completes the service.</li>
</ul>

<h3>3. Service Satisfaction & Warranty</h3>
<p>NOROZZ offers a 30-day service warranty on eligible home services. Any damage claims must be submitted within 24 hours of service completion.</p>`
  },
  partner_privacy_policy: {
    targetApp: 'partner',
    type: 'privacy_policy',
    title: 'Partner Privacy Policy',
    version: 'v1.0',
    content: `<h2>NOROZZ Service Technician & Partner Privacy Policy</h2>
<p>Last updated: September 2026 | Version v1.0</p>
<hr>
<h3>1. Partner Data Collection</h3>
<p>To register as an authorized service partner on the NOROZZ platform, we collect identity verification documents (Aadhaar, PAN, Govt ID), skill certifications, location coordinates, and bank details for earnings payouts.</p>

<h3>2. Real-Time Location Tracking</h3>
<p>When you toggle your status to <strong>Online</strong> in the NOROZZ Technician App, we collect background location data to route nearby customer booking offers and track live dispatch progress.</p>

<h3>3. Financial & Earnings Privacy</h3>
<p>Your wallet balance, commission structures, and payout records are strictly confidential and accessible only to you and authorized Super/City Admins.</p>`
  },
  partner_terms_and_conditions: {
    targetApp: 'partner',
    type: 'terms_and_conditions',
    title: 'Partner Code of Conduct & Terms of Service',
    version: 'v1.0',
    content: `<h2>NOROZZ Service Partner Code of Conduct & Terms of Service</h2>
<p>Last updated: September 2026 | Version v1.0</p>
<hr>
<h3>1. Professional Conduct & Service Quality</h3>
<p>As a NOROZZ Verified Partner, you agree to maintain high professional standards, wear appropriate safety gear, and complete all assigned tasks within the specified SLA time windows.</p>

<h3>2. Cancellation & SLA Rules</h3>
<ul>
  <li>Cancelling an accepted job without valid reason affects your SLA rating.</li>
  <li>Frequent daily cancellations may incur a penalty debit from your Partner Wallet or temporary account suspension.</li>
  <li>Service completion requires customer OTP verification in real time.</li>
</ul>

<h3>3. Commission & Payout Policy</h3>
<p>Platform commissions are automatically calculated and deducted upon job completion. Net earnings are settled directly to your registered bank account or NOROZZ Partner Wallet.</p>`
  }
};

class LegalPolicyService {
  // Get all policies
  async getAllPolicies() {
    let policies = await LegalPolicy.find().sort({ targetApp: 1, type: 1 });
    
    // Auto-seed default policies if empty
    if (!policies || policies.length === 0) {
      await LegalPolicy.insertMany(Object.values(DEFAULT_POLICIES));
      policies = await LegalPolicy.find().sort({ targetApp: 1, type: 1 });
    }
    return policies;
  }

  // Get specific policy by targetApp and type
  async getPolicy(targetApp, type) {
    let policy = await LegalPolicy.findOne({ targetApp, type });
    
    if (!policy) {
      const defaultKey = `${targetApp}_${type}`;
      const defaultData = DEFAULT_POLICIES[defaultKey];
      if (defaultData) {
        policy = await LegalPolicy.create(defaultData);
      } else {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, `Policy not found for ${targetApp} - ${type}`);
      }
    }
    return policy;
  }

  // Upsert policy
  async upsertPolicy(targetApp, type, { title, content, version, isPublished, updatedBy }) {
    if (!content || !content.trim()) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Policy content cannot be empty');
    }

    const defaultTitle = targetApp === 'customer'
      ? (type === 'privacy_policy' ? 'Customer Privacy Policy' : 'Customer Terms & Conditions')
      : (type === 'privacy_policy' ? 'Partner Privacy Policy' : 'Partner Code of Conduct & Terms of Service');

    const updateData = {
      targetApp,
      type,
      title: title || defaultTitle,
      content,
      version: version || 'v1.0',
      isPublished: isPublished !== undefined ? isPublished : true,
      lastUpdatedBy: updatedBy || 'Super Admin HQ',
    };

    const policy = await LegalPolicy.findOneAndUpdate(
      { targetApp, type },
      updateData,
      { new: true, upsert: true, runValidators: true }
    );

    return policy;
  }
}

export const legalPolicyService = new LegalPolicyService();
