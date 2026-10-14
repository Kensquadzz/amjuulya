// Vercel-ийн req/res-тэй адил энгийн mock объектууд
export function mockReq({ method = "POST", body, headers = {}, ip = "1.2.3.4" } = {}) {
  return {
    method,
    body,
    headers: { host: "localhost:3000", ...headers },
    socket: { remoteAddress: ip },
  };
}

export function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    end(data) {
      this.body = data;
      this.ended = true;
    },
    json() {
      return JSON.parse(this.body);
    },
  };
  return res;
}

let n = 0;
export const nextIp = () => `10.0.0.${++n}`;
export const rid = () => `req_${Date.now()}_${++n}`;
