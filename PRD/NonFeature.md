Non-Functional Requirements

Performance

Target: 30–60 FPS trên máy tính phổ thông.

Không tải toàn bộ asset không cần thiết ngay khi khởi động.

Sử dụng GLB và texture optimization.

Hạn chế draw calls.

Reuse geometry/materials.

Lazy load khu vực hoặc asset khi phù hợp.

Networking

WebSocket connection ổn định.

Hạn chế gửi position update quá dày.

Sử dụng interpolation.

Có reconnect handling.

Tách authoritative state khỏi local presentation state.

Maintainability

TypeScript strict mode.

Tách zone modules.

Tách interaction logic.

Tách networking logic.

Tách video providers.

Tách asset loading.

Không tạo một file SceneManager chứa toàn bộ logic.

Security

Validate office code.

Validate player name.

Rate-limit các interaction quan trọng.

Không lưu API secret ở frontend.

Không cho client tùy ý ghi đè server state.

Không xem office code là một cơ chế xác thực bảo mật.