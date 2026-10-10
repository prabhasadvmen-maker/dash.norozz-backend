const ZOOP_BASE_URL = process.env.ZOOP_BASE_URL || 'https://test.zoop.one/api/v1';
const ZOOP_APP_ID = process.env.ZOOP_APP_ID || '';
const ZOOP_API_KEY = process.env.ZOOP_API_KEY || '';

/**
 * Helper: Check if real credentials are provided
 */
export const isRealZoopConfigured = () => {
  return (
    Boolean(ZOOP_APP_ID) &&
    Boolean(ZOOP_API_KEY) &&
    ZOOP_APP_ID !== 'your_zoop_app_id' &&
    ZOOP_API_KEY !== 'your_zoop_api_key'
  );
};

export class ZoopClient {
  static async post(endpoint, data = {}, customHeaders = {}) {
    if (!isRealZoopConfigured()) {
      console.log(`[ZOOP Client Simulation] Invoked ${endpoint}`);
      return { isSimulation: true, endpoint, requestData: data };
    }

    try {
      const url = `${ZOOP_BASE_URL.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
      const headers = {
        'Content-Type': 'application/json',
        'app-id': process.env.ZOOP_APP_ID || '',
        'api-key': process.env.ZOOP_API_KEY || '',
        ...customHeaders,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });

      const resData = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMsg = resData?.response_message || resData?.message || `ZOOP HTTP Error ${response.status}`;
        console.warn(`[ZOOP Client Notice] ${endpoint}: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      return resData;
    } catch (error) {
      if (!error.message.startsWith('ZOOP Client Notice')) {
        console.warn(`[ZOOP Client Notice] ${endpoint}:`, error.message);
      }
      throw error;
    }
  }
}
