import { http } from '@kit.NetworkKit';
import { ApiTransport } from '../domain/OnlineClient';
import { ApiFailure, responseFailure } from '../domain/ApiFailure';

export class HttpTransport implements ApiTransport {
  async request(baseUrl: string, method: string, path: string, token: string, body: string): Promise<string> {
    const connection = http.createHttp();
    try {
      const header: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': token ? `Bearer ${token}` : '' };
      const options: http.HttpRequestOptions = {
        method: method as http.RequestMethod,
        header: header, expectDataType: http.HttpDataType.STRING,
        connectTimeout: 10000, readTimeout: 15000, usingCache: false
      };
      if (body) options.extraData = body;
      const response = await connection.request(`${baseUrl}${path}`, options);
      const raw = response.result as string;
      if (response.responseCode < 200 || response.responseCode >= 300) {
        throw responseFailure(response.responseCode, raw);
      }
      return raw;
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure(0, 'NETWORK_ERROR', '无法连接协作服务，请检查网络与服务地址。当前输入已保留，可稍后重试。');
    } finally { connection.destroy(); }
  }
}
