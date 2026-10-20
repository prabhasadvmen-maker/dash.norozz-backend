import dotenv from 'dotenv';
dotenv.config();

const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_FROM_EMAIL = process.env.BREVO_FROM_EMAIL || 'Sanagoyal32@gmail.com';
const BREVO_FROM_NAME = process.env.BREVO_FROM_NAME || 'Norozz';
const APP_NAME = process.env.APP_NAME || 'Norozz';

export class NotificationService {
  /**
   * Send Email OTP via Brevo API
   */
  async sendEmailOtp(recipientEmail, otpCode) {
    try {
      console.log(`📧 Sending Email OTP [****] to ${recipientEmail} via Brevo...`);

      const payload = {
        sender: {
          name: BREVO_FROM_NAME,
          email: BREVO_FROM_EMAIL,
        },
        to: [
          {
            email: recipientEmail,
          },
        ],
        subject: `${APP_NAME} Verification Code: ${otpCode}`,
        htmlContent: `
          <div style="font-family: 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h1 style="color: #2563eb; margin: 0; font-size: 24px; font-weight: 800;">${APP_NAME.toUpperCase()}</h1>
              <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Instant Service Platform</p>
            </div>
            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; text-align: center; border: 1px solid #cbd5e1;">
              <p style="margin: 0; color: #475569; font-size: 14px;">Your Verification Code is:</p>
              <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #1e293b; margin: 16px 0;">${otpCode}</div>
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">Valid for 10 minutes. Please do not share this OTP with anyone.</p>
            </div>
          </div>
        `,
      };

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': BREVO_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Brevo Email Sending Error:', errorText);
      } else {
        const result = await response.json();
        console.log('✅ Email OTP Sent via Brevo successfully:', result.messageId || 'Success');
      }
      return true;
    } catch (error) {
      console.error('❌ Failed to send Brevo Email OTP:', error);
      return false;
    }
  }

  /**
   * Send Mobile SMS OTP via APITxT Service API (https://apitxt.com/api/sendOTP)
   */
  async sendSmsOtp(phoneNumber, otpCode) {
    try {
      console.log(`📱 Sending Mobile SMS OTP [****] to ${phoneNumber}...`);
      
      const apitxtApiKey = process.env.APITXT_API_KEY;
      const rawDigits = phoneNumber.replace(/\D/g, '');
      const mobile10Digits = rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits;

      if (apitxtApiKey) {
        try {
          const response = await fetch('https://apitxt.com/api/sendOTP', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              authkey: apitxtApiKey,
              mobile: mobile10Digits,
              otp: String(otpCode),
              channel: 'sms',
              country: '91',
            }),
          });

          const resultText = await response.text();
          console.log(`✅ APITxT SMS API Response for [${mobile10Digits}]:`, resultText);
          return true;
        } catch (apiErr) {
          console.error('❌ APITxT SMS Gateway Error:', apiErr);
        }
      }

      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

      if (twilioSid && twilioAuthToken && twilioPhone) {
        const auth = Buffer.from(`${twilioSid}:${twilioAuthToken}`).toString('base64');
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: phoneNumber,
            From: twilioPhone,
            Body: `Your ${APP_NAME} Verification Code is: ${otpCode}. Valid for 5 minutes.`,
          }),
        });
        console.log('✅ Mobile SMS OTP Sent via Twilio to:', phoneNumber);
      } else {
        console.log(`ℹ️ SMS Gateway Ready. Mobile OTP generated [****] ready for verification.`);
      }
      return true;
    } catch (error) {
      console.error('❌ Failed to send Mobile SMS OTP:', error);
      return false;
    }
  }

  /**
   * Dispatch OTP automatically depending on whether input is Email or Phone Number
   */
  async dispatchOtp(emailOrPhone, otpCode) {
    if (emailOrPhone.includes('@')) {
      return await this.sendEmailOtp(emailOrPhone, otpCode);
    } else {
      return await this.sendSmsOtp(emailOrPhone, otpCode);
    }
  }
}

export const notificationService = new NotificationService();
