// LAAM — Connectors page dictionary (vi/en/zh) under the "conn." namespace.
(function () {
  if (!window.LAAMI18n || typeof window.LAAMI18n.register !== 'function') return;
  window.LAAMI18n.register({
    vi: {
      conn: {
        title: 'Kết nối — LAAM',
        heading: 'Kết nối ứng dụng',
        sub: 'Kết nối các dịch vụ bạn dùng để trợ lý gọi được dữ liệu thật qua trò chuyện. Token bạn nhập chỉ lưu trên máy chủ của bạn, không gửi đi đâu khác.',
        connected: 'Đã kết nối', notConnected: 'Chưa kết nối',
        toolsLabel: 'Công cụ',
        connect: 'Kết nối', enable: 'Bật', disconnect: 'Ngắt', test: 'Kiểm tra',
        saving: 'Đang lưu…', testing: 'Đang kiểm tra…',
        testOk: 'Kết nối OK', testErr: 'Kiểm tra thất bại', saveErr: 'Không lưu được credential',
        loadErr: 'Không tải được danh sách kết nối.',
        oauthNeeded: 'Cần OAuth — sắp có',
      },
    },
    en: {
      conn: {
        title: 'Connectors — LAAM',
        heading: 'App connectors',
        sub: 'Connect the services you use so the assistant can pull real data through chat. Tokens you enter are stored only on your server and sent nowhere else.',
        connected: 'Connected', notConnected: 'Not connected',
        toolsLabel: 'Tools',
        connect: 'Connect', enable: 'Enable', disconnect: 'Disconnect', test: 'Test',
        saving: 'Saving…', testing: 'Testing…',
        testOk: 'Connection OK', testErr: 'Test failed', saveErr: 'Could not save credentials',
        loadErr: 'Could not load connectors.',
        oauthNeeded: 'OAuth needed — coming soon',
      },
    },
    zh: {
      conn: {
        title: '连接器 — LAAM',
        heading: '应用连接器',
        sub: '连接你常用的服务，助手即可通过对话获取真实数据。你输入的令牌仅保存在你的服务器上，不会发送到其他地方。',
        connected: '已连接', notConnected: '未连接',
        toolsLabel: '工具',
        connect: '连接', enable: '启用', disconnect: '断开', test: '测试',
        saving: '保存中…', testing: '测试中…',
        testOk: '连接正常', testErr: '测试失败', saveErr: '无法保存凭据',
        loadErr: '无法加载连接器。',
        oauthNeeded: '需要 OAuth — 即将推出',
      },
    },
  });
})();
