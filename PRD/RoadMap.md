Five-Phase Implementation Roadmap

Phase 1 — 3D Environment Foundation

Goal: Xây dựng văn phòng 3D hoàn chỉnh có thể khám phá.

Tasks:

Thiết lập Three.js + TypeScript + Vite.

Tạo scene và renderer.

Thiết lập third-person camera.

Dựng office environment.

Import GLB assets.

Thiết lập ánh sáng.

Tạo năm khu vực chức năng.

Collision boundaries.

Basic movement controller.

Deliverable:
Một người chơi có thể bước vào và di chuyển trong văn phòng 3D.

Acceptance criteria:

Scene load thành công.

Camera hoạt động ổn định.

Nhân vật không đi xuyên tường.

Các khu vực có thể nhận biết rõ ràng.

Performance đạt mục tiêu trên máy tính phổ thông.

Phase 2 — Employee Avatar & Interaction

Goal: Biến môi trường thành một không gian có thể tương tác.

Tasks:

Avatar selection.

Avatar animation.

Idle/walk/sit/work.

Interaction manager.

Workstation interactions.

Pantry interactions.

Storage interactions.

Entrance interactions.

Nameplate và activity status.

Deliverable:
Nhân vật có thể làm việc, nghỉ ngơi và tương tác với nội thất.

Acceptance criteria:

Ngồi và đứng dậy được.

Animation chuyển đổi đúng.

Có thể tương tác với máy tính và coffee machine.

Hiển thị đúng tên và trạng thái nhân viên.

Phase 3 — Multiplayer Foundation

Goal: Cho nhiều nhân viên cùng tham gia văn phòng.

Tasks:

Khởi tạo Colyseus server.

Office Room.

Employee schema.

Join/leave flow.

Player movement synchronization.

Animation state synchronization.

Disconnect handling.

Client interpolation.

Online employee list.

Deliverable:
3–10 người có thể cùng xuất hiện trong một phòng.

Acceptance criteria:

Người chơi thấy avatar của nhau.

Vị trí và hướng được đồng bộ.

Animation được đồng bộ.

Người chơi disconnect được xử lý đúng.

Không xuất hiện avatar ma sau khi disconnect.

Phase 4 — Shared TV & Entertainment

Goal: Nhiều nhân viên cùng xem video.

Tasks:

TV model.

CSS3DRenderer integration.

CSS3DObject.

YouTube IFrame Player API.

Video search/catalog.

Play/pause/seek.

Shared TV state.

WebSocket synchronization.

Error handling cho video không cho phép embedding.

Deliverable:
Một người có thể chọn video và những người khác cùng xem.

Acceptance criteria:

TV được gắn đúng vào tường.

Video hiển thị đúng vị trí.

Play/pause được đồng bộ.

Thời gian phát được đồng bộ trong giới hạn sai lệch cho phép.

Xử lý được video bị chặn embedding.

Phase 5 — Polish, Optimization & Deployment

Goal: Hoàn thiện prototype có thể chia sẻ cho nhân viên sử dụng.

Tasks:

UI polish.

Loading screen.

Join Office flow.

Connection status.

Error handling.

3D asset optimization.

Performance profiling.

Multiplayer stress testing.

Deploy frontend.

Deploy backend.

Production configuration.

Deliverable:
Một Virtual 3D Office prototype có thể truy cập bằng URL.

Acceptance criteria:

Người dùng có thể tham gia bằng office code.

3–10 người có thể cùng tham gia.

Các tính năng cốt lõi hoạt động.

Không cần cài đặt phần mềm client.

Có thể sử dụng trên desktop browser.