import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { Category } from '../models/category.model.js';
import { Service } from '../models/service.model.js';
import { AiChatMessage } from '../models/aiChatMessage.model.js';

export class AiChatService {
  constructor() {
    this.apiKey = process.env.GROQ_API_KEY || '';
    this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    this.models = [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'llama3-70b-8192',
      'llama3-8b-8192',
      'mixtral-8x7b-32768',
      'gemma2-9b-it'
    ];
  }

  async getChatHistory(user, limit = 50) {
    if (!user?._id) return [];
    try {
      const messages = await AiChatMessage.find({ user: user._id })
        .sort({ createdAt: 1 })
        .limit(limit);

      return messages.map(m => ({
        id: m._id.toString(),
        role: m.role,
        text: m.text,
        modelUsed: m.modelUsed,
        timestamp: new Date(m.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      }));
    } catch (err) {
      console.warn('Error fetching AI Chat history:', err);
      return [];
    }
  }

  async clearChatHistory(user) {
    if (!user?._id) return { success: true, count: 0 };
    try {
      const result = await AiChatMessage.deleteMany({ user: user._id });
      return { success: true, count: result.deletedCount || 0 };
    } catch (err) {
      console.warn('Error clearing AI Chat history:', err);
      throw new ApiError(HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Could not clear AI chat history');
    }
  }

  detectIntent(cleanPrompt) {
    const p = (cleanPrompt || '').trim().toLowerCase();

    // 1. GREETING INTENT
    if (/^(hi|hello|hey|hlo|helo|namaste|good morning|good evening|good afternoon|kaise ho|who are you|tum kaun ho|kaun ho|what is your name|aapka naam|kaise hain)\b/.test(p) || p === 'hi' || p === 'hello' || p === 'hey') {
      return 'GREETING';
    }

    // 2. CLOSING / THANK YOU INTENT
    if (/^(thanks|thank you|dhanyawad|shukriya|bye|good night|ok|okay|alvida)\b/.test(p) || p === 'thanks' || p === 'thank you') {
      return 'CLOSING';
    }

    // 3. REFERRAL INTENT
    if (p.includes('refer') || p.includes('invite') || p.includes('earn') || p.includes('referral')) {
      return 'REFERRAL';
    }

    // 4. GUARANTEE INTENT
    if (p.includes('guarantee') || p.includes('30 day') || p.includes('30-day') || p.includes('revisit') || p.includes('dobara') || p.includes('dubara')) {
      return 'GUARANTEE';
    }

    // 5. REFUND / CANCELLATION INTENT
    if (p.includes('refund') || p.includes('cancel') || p.includes('cancellation') || p.includes('money back') || p.includes('paisa wapas') || p.includes('wallet')) {
      return 'REFUND';
    }

    // 6. SAFETY / KYC INTENT
    if (p.includes('safe') || p.includes('safety') || p.includes('kyc') || p.includes('police') || p.includes('verify') || p.includes('verified') || p.includes('trust')) {
      return 'SAFETY';
    }

    // 7. DISPATCH TIMING INTENT
    if (p.includes('dispatch') || p.includes('kitne time') || p.includes('kitni der') || p.includes('how fast') || p.includes('30 min') || p.includes('time lagta')) {
      return 'DISPATCH';
    }

    // 8. COMPLAINT / SUPPORT INTENT
    if (p.includes('complaint') || p.includes('call') || p.includes('number') || p.includes('support') || p.includes('hotline') || p.includes('issue') || p.includes('contact')) {
      return 'SUPPORT';
    }

    // 9. SERVICE SPECIFIC ENQUIRY
    const serviceKeywords = ['ac', 'clean', 'cleaning', 'repair', 'plumb', 'tap', 'leak', 'sofa', 'carpet', 'electric', 'switch', 'wiring', 'salon', 'hair', 'grooming', 'driver', 'shift', 'shifting', 'paint', 'wash', 'bath', 'bathroom', 'kitchen', 'price', 'cost', 'charge', 'rate', 'book', 'package'];
    if (serviceKeywords.some(kw => p.includes(kw))) {
      return 'SERVICE_ENQUIRY';
    }

    return 'GENERAL';
  }

  async getDbServicesForQuery(prompt) {
    try {
      // Ensure Category schema is registered in Mongoose for populate
      await Category.findOne().limit(1).catch(() => { });

      const cleanPrompt = (prompt || '').toLowerCase();

      const stopWords = new Set([
        'kya', 'hai', 'the', 'and', 'for', 'kaise', 'book', 'bhai', 'batao', 'chahiye',
        'price', 'kitna', 'kitne', 'cost', 'charge', 'rate', 'wala', 'wali', 'karo',
        'mujhe', 'ko', 'par', 'per', 'how', 'much', 'what', 'is', 'are', 'in', 'on',
        'of', 'to', 'me', 'pe', 'tell', 'show', 'give', 'list', 'please', 'sir', 'need', 'want'
      ]);

      const rawWords = cleanPrompt.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/);
      const keywords = rawWords.filter(w => w.length >= 2 && !stopWords.has(w));

      // Fetch all active services with populated category
      const allActiveServices = await Service.find({ status: 'active' }).populate('category', 'name');

      if (keywords.length === 0) {
        return allActiveServices.slice(0, 6);
      }

      // Relevance scoring logic
      const scoredServices = allActiveServices.map(s => {
        let score = 0;
        const nameLower = (s.name || '').toLowerCase();
        const descLower = (s.description || '').toLowerCase();
        const catLower = (s.category?.name || '').toLowerCase();

        // Exact phrase match in service name (highest priority)
        if (cleanPrompt.includes(nameLower)) {
          score += 100;
        }

        for (const kw of keywords) {
          if (nameLower === kw) {
            score += 50;
          } else if (nameLower.includes(kw)) {
            score += 30;
            if (nameLower.startsWith(kw)) score += 10;
          }

          if (catLower.includes(kw)) {
            score += 15;
          }

          if (descLower.includes(kw)) {
            score += 5;
          }

          if (s.tags && Array.isArray(s.tags)) {
            if (s.tags.some(t => t.toLowerCase().includes(kw))) {
              score += 10;
            }
          }
        }

        return { service: s, score };
      });

      const matches = scoredServices
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => item.service);

      if (matches.length > 0) {
        return matches.slice(0, 6);
      }

      return allActiveServices.slice(0, 6);
    } catch (err) {
      console.warn('DB Service fetch for AI Chat error:', err);
      return [];
    }
  }

  getSystemPrompt(user, dbServices = []) {
    const userName = user?.name || 'Valued Customer';
    const userCity = user?.city || 'Delhi NCR';

    let dbServicesText = '';
    if (dbServices && dbServices.length > 0) {
      dbServicesText = dbServices.map(s => {
        const catName = s.category?.name || 'Home Services';
        return `- ${s.name} (Category: ${catName}): Price ₹${s.finalPrice || s.price} (Original ₹${s.price}), Duration: ${s.duration || '45 mins'}, Description: ${s.description || 'Verified Service'}`;
      }).join('\n');
    }

    return `You are "Norozz AI", the official 24/7 intelligent customer AI assistant for NOROZZ Home Services Platform (norozz.in).
You are talking to customer "${userName}" located in "${userCity}".

YOUR PERSONALITY & GOALS:
- Helpful, polite, professional, friendly, and expert in home services.
- Provide instant, accurate recommendations for home cleaning, AC repair, plumbing, electrician, salon & spa, and driver services.
- Respond in natural English or Hinglish based on how the customer speaks.
- Keep responses concise, clear, and easy to read.

LIVE NOROZZ DATABASE CATALOG & PRICING:
${dbServicesText}

GUARANTEES & POLICIES:
- 30-Day Service Guarantee: Free re-visit if customer is unsatisfied within 30 days.
- 30-Min Instant Dispatch: Background-verified partner dispatched within 30 minutes.
- Verified Experts: 100% Aadhaar KYC & Criminal background verified partners.

SERVICE RECOMMENDATION CARD FORMAT:
When recommending a specific service package to the customer, include a structured JSON block inside your response wrapped in [SERVICE_CARD] ... [/SERVICE_CARD] so the app can display an interactive "Quick Book" card to the user:

Example format inside response:
[SERVICE_CARD]
{
  "title": "Kitchen Cleaning",
  "price": 499,
  "originalPrice": 499,
  "rating": 4.8,
  "category": "Home Cleaning & Housekeeping",
  "image": "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&auto=format&fit=crop"
}
[/SERVICE_CARD]`;
  }

  buildSmartDbResponse(user, newPrompt, matchedServices) {
    const userName = user?.name ? user.name.split(' ')[0] : 'Customer';
    const intent = this.detectIntent(newPrompt);

    // 1. GREETING
    if (intent === 'GREETING') {
      return {
        reply: `Hello ${userName}! 👋 Main aapka **Norozz AI Assistant** hoon.\n\nMain aapki home services, house cleaning, AC repair & servicing, plumbing, electrician, salon aur driver bookings me madad kar sakta hoon.\n\nAaj main aapki kis service me help karoon?`,
        model: 'db-smart-nlp',
        usage: {}
      };
    }

    // 2. CLOSING
    if (intent === 'CLOSING') {
      return {
        reply: `Aapka swagat hai ${userName}! 😊 NOROZZ AI hamesha aapki madad ke liye tayyar hai.\n\nAgar aapko koi bhi service book karni ho, to bas mujhe bataiye. Aapka din shubh ho! 🌟`,
        model: 'db-smart-nlp',
        usage: {}
      };
    }

    // 3. REFERRAL
    if (intent === 'REFERRAL') {
      return {
        reply: `NOROZZ Referral Program 🎉\n\nAap apne dosto ko NOROZZ par invite karke **₹200 Wallet Reward** kama sakte hain!\n\n• **Kaise kaam karta hai?**\n  1. Profile section me jaakar apna unique referral code copy karein.\n  2. Apne dosto ke saath WhatsApp ya SMS par share karein.\n  3. Jab aapka dost NOROZZ par apni 1st service booking complete karega, aapke **NOROZZ Wallet** me instant **₹200** credit ho jayenge!`,
        model: 'db-smart-nlp',
        usage: {}
      };
    }

    // 4. GUARANTEE
    if (intent === 'GUARANTEE') {
      return {
        reply: `NOROZZ 30-Day Service Guarantee 🛡️\n\nAapki satisfaction humari sabse badi priority hai!\n\n• **30-Day Satisfaction Guarantee**: Agar service ke baad aap unsatisfied hain ya koi samasya aati hai, to 30 dino ke andar free re-visit expert dispatch kiya jata hai.\n• **No Extra Fee**: Guarantee re-visit ke liye koi alag se charge nahi liya jata.`,
        model: 'db-smart-nlp',
        usage: {}
      };
    }

    // 5. REFUND
    if (intent === 'REFUND') {
      return {
        reply: `NOROZZ Refund & Cancellation Policy 💳\n\n• **Free Cancellation**: Scheduled time slot se 2 ghante pehle tak aap apni booking bilkul FREE cancel kar sakte hain.\n• **Instant Refund**: Cancellation refund aapke **NOROZZ Wallet** me instantly credit ho jata hai, ya original payment mode me 24 ghante me aa jata hai.`,
        model: 'db-smart-nlp',
        usage: {}
      };
    }

    // 6. SAFETY
    if (intent === 'SAFETY') {
      return {
        reply: `NOROZZ Partner Safety & Trust 🔒\n\nHumare sabhi Service Partners 100% Verified hain:\n\n• **Aadhaar & Identity KYC**: Har partner ka official identity verification hota hai.\n• **Police Background Check**: Criminal record check completed.\n• **Professional Rating**: Top-rated 4.8+ rated technicians only.`,
        model: 'db-smart-nlp',
        usage: {}
      };
    }

    // 7. DISPATCH
    if (intent === 'DISPATCH') {
      return {
        reply: `NOROZZ 30-Minute Dispatch ⚡\n\nBooking confirm hote hi nearby verified professional ko aapki location ke liye assign kar diya jata hai. Standard technician dispatch time **30 minutes** hai!`,
        model: 'db-smart-nlp',
        usage: {}
      };
    }

    // 8. SUPPORT
    if (intent === 'SUPPORT') {
      return {
        reply: `NOROZZ 24x7 Customer Helpdesk 🎧\n\nHumari customer support team hamesha aapki sahayata ke liye uplabdh hai:\n\n• 📞 **Toll-Free Hotline**: 1800 200 9090 (Toll Free)\n• 💬 **WhatsApp Support**: Instant Chat Support via Profile > Support\n• 🎫 **Submit Ticket**: App ke Help Center section me ticket raise kar sakte hain.`,
        model: 'db-smart-nlp',
        usage: {}
      };
    }

    // 9. SERVICE ENQUIRY or GENERAL
    let mainServiceCard = '';
    if (matchedServices && matchedServices.length > 0) {
      const s = matchedServices[0];
      const catName = s.category?.name || 'Home Services';

      let fallbackImage = (s.thumbnail && s.thumbnail.startsWith('http') && !s.thumbnail.includes('loremflickr')) ? s.thumbnail : null;
      if (!fallbackImage) {
        const lowerCat = catName.toLowerCase();
        const lowerName = s.name.toLowerCase();

        if (lowerCat.includes('ac') || lowerName.includes('ac')) {
          fallbackImage = 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800&auto=format&fit=crop';
        } else if (lowerCat.includes('kitchen') || lowerName.includes('kitchen')) {
          fallbackImage = 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&auto=format&fit=crop';
        } else if (lowerCat.includes('cleaning') || lowerName.includes('clean')) {
          fallbackImage = 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&auto=format&fit=crop';
        } else if (lowerCat.includes('plumbing') || lowerName.includes('tap') || lowerName.includes('leak')) {
          fallbackImage = 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&auto=format&fit=crop';
        } else if (lowerCat.includes('sofa') || lowerName.includes('sofa') || lowerName.includes('carpet')) {
          fallbackImage = 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&auto=format&fit=crop';
        } else if (lowerCat.includes('salon') || lowerCat.includes('beauty') || lowerName.includes('hair') || lowerName.includes('makeup')) {
          fallbackImage = 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&auto=format&fit=crop';
        } else if (lowerCat.includes('electric') || lowerName.includes('switch') || lowerName.includes('wiring')) {
          fallbackImage = 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800&auto=format&fit=crop';
        } else {
          fallbackImage = 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&auto=format&fit=crop';
        }
      }

      mainServiceCard = `[SERVICE_CARD]
{
  "title": "${s.name}",
  "price": ${s.finalPrice || s.price},
  "originalPrice": ${s.price},
  "rating": 4.8,
  "category": "${catName}",
  "image": "${fallbackImage}"
}
[/SERVICE_CARD]`;
    }

    let replyText = `Hello ${userName}! 👋\n\n`;

    if (intent === 'SERVICE_ENQUIRY' && matchedServices && matchedServices.length > 0) {
      replyText += `Aapke request ke anusar, NOROZZ database se real-time available packages aur prices ye hain:\n\n`;
      matchedServices.slice(0, 4).forEach((s) => {
        replyText += `• **${s.name}**: ₹${s.finalPrice || s.price}`;
        if (s.price > (s.finalPrice || s.price)) {
          replyText += ` ~₹${s.price}~`;
        }
        if (s.duration) {
          replyText += ` (${s.duration})`;
        }
        replyText += `\n`;
      });
      replyText += `\n✨ **Includes**: 30-Day Guarantee, 30-Min Dispatch & Aadhaar-verified technicians.\n`;
    } else {
      replyText += `Main **Norozz AI Assistant** hoon! Aap mujhse kisi bhi service ke baare me pooch sakte hain:\n\n`;
      replyText += `• **AC Repair & Servicing**: Starting ₹299\n`;
      replyText += `• **Home & Kitchen Cleaning**: Starting ₹399\n`;
      replyText += `• **Plumbing & Water Leakage**: Starting ₹249\n`;
      replyText += `• **Electrician & Switchboard**: Starting ₹249\n`;
      replyText += `• **Salon & Grooming**: Starting ₹399\n\n`;
      replyText += `Aap kis service ke baare me janna chahte hain?`;
    }

    if (intent === 'SERVICE_ENQUIRY' && mainServiceCard) {
      replyText += `\n${mainServiceCard}`;
    }

    return {
      reply: replyText,
      model: 'db-smart-nlp',
      usage: {}
    };
  }

  async getChatCompletion(user, messageHistory, newPrompt) {
    // Handle overload: getChatCompletion(user, promptText)
    if (typeof messageHistory === 'string' && !newPrompt) {
      newPrompt = messageHistory;
      messageHistory = null;
    }

    if (!newPrompt || !newPrompt.trim()) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Message content is required');
    }

    // Auto-fetch last 8 messages from DB if client did not pass history array
    if ((!messageHistory || !Array.isArray(messageHistory)) && user?._id) {
      try {
        const dbMsgs = await AiChatMessage.find({ user: user._id })
          .sort({ createdAt: -1 })
          .limit(8);

        messageHistory = dbMsgs.reverse().map((m) => ({
          role: m.role,
          content: m.text,
        }));
      } catch (err) {
        console.warn('Could not fetch DB history for AI completion:', err);
        messageHistory = [];
      }
    }

    // Save user message to DB
    if (user?._id) {
      await AiChatMessage.create({
        user: user._id,
        role: 'user',
        text: newPrompt.trim(),
      }).catch(err => console.warn('Could not save user AI message:', err));
    }

    // 1. Dynamic DB Services Query based on user prompt with relevance scoring
    const matchedServices = await this.getDbServicesForQuery(newPrompt);

    // 2. Build Groq AI prompt with live DB services context
    const systemPrompt = this.getSystemPrompt(user, matchedServices);

    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    if (Array.isArray(messageHistory)) {
      for (const msg of messageHistory.slice(-8)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role,
            content: String(msg.content || msg.text || '')
          });
        }
      }
    }

    messages.push({ role: 'user', content: newPrompt.trim() });

    // 3. Try Groq AI API models if API key is configured
    let lastError = null;
    let finalResult = null;

    const currentApiKey = (process.env.GROQ_API_KEY || this.apiKey || '').trim();

    if (currentApiKey && !currentApiKey.includes('placeholder')) {
      for (const modelName of this.models) {
        const cleanModel = String(modelName || '').replace(/^groq\//i, '').trim();
        try {
          const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${currentApiKey}`
            },
            body: JSON.stringify({
              model: cleanModel,
              messages,
              temperature: 0.7,
              max_tokens: 1024
            })
          });

          if (!response.ok) {
            if (response.status === 404) {
              console.warn(`Groq model "${cleanModel}" (404 Not Found/Deprecated), trying fallback model...`);
            } else {
              const errText = await response.text().catch(() => '');
              console.warn(`Groq model ${cleanModel} HTTP Error: ${response.status} ${errText}`);
            }
            lastError = new Error(`Groq API Error (${response.status})`);
            continue;
          }

          const data = await response.json();
          const replyText = data?.choices?.[0]?.message?.content;

          if (replyText) {
            finalResult = {
              reply: replyText,
              model: modelName,
              usage: data?.usage || {}
            };
            break;
          }
        } catch (err) {
          console.warn(`Groq request failed for model ${modelName}:`, err.message);
          lastError = err;
        }
      }
    }

    // 4. Return Dynamic Smart NLP Response if Groq was not used
    if (!finalResult) {
      finalResult = this.buildSmartDbResponse(user, newPrompt, matchedServices);
      if (lastError) {
        finalResult.error = lastError.message;
      }
    }

    // Save assistant reply to DB
    if (user?._id && finalResult?.reply) {
      await AiChatMessage.create({
        user: user._id,
        role: 'assistant',
        text: finalResult.reply,
        modelUsed: finalResult.model || 'norozz-ai'
      }).catch(err => console.warn('Could not save assistant AI message:', err));
    }

    return finalResult;
  }
}

export const aiChatService = new AiChatService();
