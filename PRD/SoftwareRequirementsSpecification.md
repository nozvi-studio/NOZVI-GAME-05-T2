Version: 1.0.0
Project Type: Browser-based Multiplayer 3D Virtual Office
Status: Prototype Planning
Platform: Web
Primary Language: TypeScript
Visual Direction: Semi-realistic Stylized 3D
Camera: Third-person
Multiplayer Capacity: 3–10 concurrent employees per office room
1. Project Overview

1.1. Project Vision

Virtual 3D Office là một không gian văn phòng ảo trên nền tảng Web, nơi các thành viên trong cùng một văn phòng có thể đăng nhập bằng tên và mã văn phòng, di chuyển bằng nhân vật 3D, tương tác với môi trường, làm việc và giải trí cùng nhau.

Thay vì xây dựng một căn phòng 3D chỉ mang tính trang trí, dự án phải biến từng khu vực trong văn phòng thành một hệ thống tương tác độc lập.

Người dùng có thể:

Tham gia văn phòng bằng tên và mã văn phòng.

Lựa chọn nhân vật có sẵn.

Di chuyển tự do trong không gian 3D.

Ngồi vào workstation và thực hiện animation làm việc.

Tương tác với các vật dụng trong văn phòng.

Gặp gỡ và nhìn thấy những nhân viên khác theo thời gian thực.

Cùng xem video YouTube trên TV được gắn trong văn phòng.

1.2. Core Experience

Prototype phải chứng minh được bốn trải nghiệm:

Người chơi có thể bước vào một văn phòng 3D có chất lượng hình ảnh tốt.

Nhân vật có thể di chuyển, ngồi làm việc và tương tác với nội thất.

Có từ 3–10 người cùng xuất hiện trong một phòng và nhìn thấy hành động của nhau theo thời gian thực.

Tất cả người chơi có thể cùng xem một video trên TV trong văn phòng.

Không mở rộng phạm vi sang hệ thống metaverse, nền kinh tế ảo, inventory phức tạp hoặc các tính năng xã hội không cần thiết cho prototype.

2. Art Direction & 3D Environment

2.1. Visual Direction

Phong cách: Semi-realistic Stylized 3D.

Tham chiếu hình ảnh:

Văn phòng hiện đại, gọn gàng.

Bàn làm việc, màn hình máy tính, ghế văn phòng.

Cửa sổ lớn, ánh sáng tự nhiên.

Nội thất có vật liệu gỗ, kim loại, vải và kính.

Nhân vật có tỷ lệ stylized, đầu lớn hơn thực tế một chút, biểu cảm thân thiện.

Màu sắc sáng, ấm và dễ chịu.

Không hướng tới photorealism vì mục tiêu là đảm bảo hiệu năng WebGL và khả năng mở rộng asset.

2.2. Office Zones

Toàn bộ văn phòng phải được chia thành năm khu vực chức năng.

A. Workstation Zone

Mục đích: Không gian làm việc của nhân viên.

3D assets:

Desks.

Office chairs.

Computer monitors.

Keyboards.

Mice.

Desk lamps.

Stationery.

Decorative objects.

Interactions:

Nhân viên có thể ngồi vào ghế.

Nhân viên có thể đứng dậy.

Nhân vật chuyển sang animation làm việc.

Có thể tương tác với máy tính.

Hiển thị tên và trạng thái nhân viên.

Mỗi workstation cần có một interaction point và một vị trí ngồi được xác định trước.

B. Pantry Zone

Mục đích: Khu vực nghỉ ngơi và giải khát.

3D assets:

Coffee machine.

Water dispenser.

Cups.

Refrigerator.

Countertop.

Cabinets.

Interactions:

Lấy cà phê.

Pha cà phê bằng animation.

Uống nước.

Nghỉ ngơi.

Hiển thị trạng thái nghỉ giải lao.

C. Storage Zone

Mục đích: Khu vực lưu trữ và vật dụng cá nhân.

3D assets:

Storage cabinets.

Personal lockers.

Shelves.

Boxes.

Personal decorative items.

Interactions:

Mở tủ.

Đóng tủ.

Xem vật dụng cá nhân.

Tương tác với các locker được phân bổ.

Prototype chỉ cần interaction cơ bản, chưa cần hệ thống inventory.

D. Entrance Zone

Mục đích: Khu vực ra vào văn phòng.

3D assets:

Main entrance door.

Door frame.

Reception desk (optional).

Decorative plants.

Office signage.

Interactions:

Nhân viên xuất hiện tại khu vực spawn khi vào phòng.

Có thể mở và đóng cửa.

Có thể di chuyển ra khỏi văn phòng.

Có thể hiển thị danh sách thành viên hiện diện.

E. Entertainment Zone

Mục đích: Không gian giải trí và xem video chung.

3D assets:

Wall-mounted TV.

TV stand (optional).

Sofa.

Coffee table.

Speakers.

Decorative lighting.

Interactions:

Mở TV.

Mở giao diện chọn video.

Chọn video từ nguồn được hỗ trợ.

Phát và tạm dừng.

Điều chỉnh thời gian phát.

Đồng bộ trạng thái xem giữa các thành viên.

Entertainment Zone phải là một hệ thống độc lập, không gắn logic phát video trực tiếp vào Office Scene.

3. Gameplay & Functional Requirements

3.1. Employee Avatar System

Mỗi nhân viên được đại diện bằng một nhân vật 3D.

Avatar Selection

Có sẵn một tập hợp avatar.

Người dùng được chọn avatar trước khi vào văn phòng.

Mỗi avatar có model và animation tương ứng.

Không yêu cầu tạo nhân vật tùy chỉnh trong prototype.

Movement

Controls:

W: Move forward.

A: Move left.

S: Move backward.

D: Move right.

Mouse: Rotate camera.

Space: Optional jump.

E: Interact.

Esc: Close interaction UI.

Movement requirements:

Third-person camera.

Character rotation theo hướng di chuyển.

Camera follow.

Collision detection.

Không cho nhân vật đi xuyên qua tường và nội thất.

Giới hạn movement trong office boundaries.

Character States

Các trạng thái cơ bản:

Idle.

Walking.

Running (optional).

Sitting.

Working.

Drinking.

Coffee interaction.

Waving.

Relaxing.

Identity Display

Mỗi nhân vật hiển thị:

Employee name.

Online status.

Current activity.

Ví dụ:

Employee: Kism
Status: Working

3.2. Employee Identity System

Prototype không yêu cầu tài khoản hoặc mật khẩu.

Luồng tham gia:

Người dùng mở website.

Nhập tên nhân viên.

Nhập office code.

Chọn avatar.

Nhấn Join Office.

Hệ thống tìm hoặc tạo room tương ứng.

Nhân vật xuất hiện tại Entrance Zone.

Data model:

interface EmployeeIdentity {
  sessionId: string;
  employeeName: string;
  officeCode: string;
  avatarId: string;
  status: "online" | "working" | "away";
}

Office code dùng để xác định phòng multiplayer.

Lưu ý: Đây là nhận diện người dùng mức prototype, không phải xác thực danh tính bảo mật. Cần giới hạn độ dài tên, kiểm tra mã phòng và chống spam cơ bản.

3.3. Multiplayer Office

Mục tiêu: 3–10 người cùng xuất hiện trong một văn phòng.

Functional requirements:

Nhiều người có thể tham gia cùng room.

Nhìn thấy avatar của nhau.

Đồng bộ vị trí.

Đồng bộ hướng nhân vật.

Đồng bộ animation state.

Đồng bộ trạng thái ngồi và đứng.

Hiển thị thành viên đang online.

Xử lý người chơi disconnect.

Xóa avatar khỏi scene khi người dùng rời phòng.

Networking requirements:

Sử dụng WebSocket.

Server authoritative đối với trạng thái quan trọng.

Client gửi input hoặc movement intent.

Server kiểm tra và đồng bộ trạng thái.

Client sử dụng interpolation để chuyển động nhân vật mượt mà.

Không gửi toàn bộ scene hoặc asset qua mạng.

Chỉ đồng bộ dữ liệu cần thiết.

3.4. Shared TV System

Đây là một trong những tính năng cốt lõi của prototype.

TV Placement

TV được gắn trực tiếp lên tường tại Entertainment Zone.

Playback

Nguồn phát ban đầu:

YouTube IFrame Player API.

Các video công khai được phép nhúng.

Video public-domain hoặc video nội bộ có quyền sử dụng.

TV Controls

Open TV.

Search video.

Select video.

Play.

Pause.

Seek.

Change video.

Close TV interface.

Shared Playback State

interface SharedTVState {
  videoId: string | null;
  provider: "youtube";
  status: "idle" | "playing" | "paused";
  currentTime: number;
  updatedAt: number;
  controllerSessionId: string | null;
}

Synchronization

Khi một người điều khiển TV:

Server nhận lệnh.

Server cập nhật SharedTVState.

Các client nhận state update qua WebSocket.

Các client điều khiển YouTube player của mình theo trạng thái chung.

Không truyền video stream qua Colyseus.

Mỗi trình duyệt tải video trực tiếp từ YouTube. Colyseus chỉ truyền metadata và playback commands.

TV Permission

Prototype:

Mặc định tất cả nhân viên có thể điều khiển TV.

Chỉ một lệnh điều khiển được xử lý tại một thời điểm.

Server là nơi quyết định trạng thái cuối cùng.

Có thể bổ sung TV host/admin permission trong phiên bản sau.

Movie Provider Architecture

Thiết kế provider độc lập:

interface VideoProvider {
  search(query: string): Promise<VideoItem[]>;
  getVideo(id: string): Promise<VideoItem | null>;
  getEmbedUrl(id: string): string;
}

interface VideoItem {
  id: string;
  title: string;
  thumbnail: string;
  provider: string;
  duration?: number;
  sourceUrl: string;
  embeddable: boolean;
}

Các nguồn được nghiên cứu:

YouTube Data API.

Internet Archive.

Public-domain video collections.

Jellyfin cho thư viện nội bộ.

Yêu cầu đặc biệt:

Ưu tiên API miễn phí.

Không sử dụng API trả phí trong prototype nếu có phương án miễn phí phù hợp.

Không scrape hoặc phụ thuộc vào website phim lậu.

Không bypass DRM.

Kiểm tra quyền nhúng và điều khoản sử dụng của từng nguồn.

Không giả định tất cả video đều có thể phát trong iframe.

Thiết kế hệ thống để bổ sung provider mới mà không phải sửa TV controller.

4. Office Interaction System

Mỗi khu vực có interaction manager riêng.

4.1. Interaction Architecture

interface OfficeInteractable {
  id: string;
  type: string;
  position: [number, number, number];
  interactionRange: number;

  interact(employeeId: string): void;
}

Các object tương tác:

Computer.

Chair.

Coffee machine.

Water dispenser.

Storage cabinet.

Main door.

TV.

4.2. Interaction Flow

Nhân viên đến gần object.

Hệ thống kiểm tra interaction range.

Hiển thị nút E - Interact.

Người chơi nhấn E.

Interaction manager xác định loại object.

Gọi logic tương ứng.

Cập nhật animation và UI.

Không đặt toàn bộ logic tương tác trong một file hoặc một component duy nhất.

