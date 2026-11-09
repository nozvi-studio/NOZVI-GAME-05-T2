5.1. Technology Stack

3D Client

Three.js.

TypeScript.

Vite.

GLTFLoader.

AnimationMixer.

CSS3DRenderer.

Rapier Physics (nếu cần physics/collision nâng cao).

Responsibilities:

3D environment.

Lighting.

Camera.

Avatar rendering.

Character animation.

Collision.

Interaction.

TV placement.

Frontend UI

React.

TypeScript.

HTML.

CSS.

Zustand (client-side state management).

Responsibilities:

Join Office screen.

Avatar selection.

Employee list.

Chat UI (optional).

TV controller.

Settings.

Interaction panels.

React không cần quản lý từng frame của 3D scene. Three.js cần có vòng đời render riêng.

Multiplayer Backend

Node.js.

TypeScript.

Colyseus.

WebSocket.

Colyseus Schema.

Responsibilities:

Room management.

Matchmaking.

Player connection.

State synchronization.

Player movement state.

Animation state.

Shared TV state.

Disconnect handling.

Communication

Sử dụng hai nhóm giao tiếp:

HTTP / REST

Health check.

Configuration.

Movie catalog.

Static metadata.

Các API request không yêu cầu realtime.

WebSocket

Player movement updates.

Player join/leave.

Player animation states.

Interaction events.

Shared TV commands.

Chat messages (optional).

WebSocket là thành phần bắt buộc của multiplayer architecture, không phải công nghệ thay thế Colyseus.

5.2. High-Level Architecture

                 WEB BROWSER
                      |
          +-----------+-----------+
          |                       |
      React UI                Three.js
          |                       |
          |                 CSS3DRenderer
          |                       |
          |                  TV / YouTube
          |                       |
          +-----------+-----------+
                      |
                Colyseus Client
                      |
                   WebSocket
                      |
              COLYSEUS SERVER
                 Node.js
                      |
          +-----------+-----------+
          |           |           |
       Office      Employee     Shared TV
        Room        State         State
          |
       Room State
          |
       3-10 Players

5.3. Recommended Project Structure

virtual-3d-office/
│
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── features/
│   │   │   │   ├── identity/
│   │   │   │   ├── employees/
│   │   │   │   ├── tv/
│   │   │   │   └── settings/
│   │   │   ├── game/
│   │   │   │   ├── core/
│   │   │   │   ├── camera/
│   │   │   │   ├── characters/
│   │   │   │   ├── environments/
│   │   │   │   ├── interactions/
│   │   │   │   ├── zones/
│   │   │   │   └── rendering/
│   │   │   ├── networking/
│   │   │   ├── stores/
│   │   │   └── styles/
│   │   │
│   │   └── public/
│   │       └── assets/
│   │           ├── models/
│   │           ├── textures/
│   │           ├── animations/
│   │           └── icons/
│   │
│   ├── server/
│   │   └── src/
│   │       ├── rooms/
│   │       ├── schemas/
│   │       ├── services/
│   │       ├── handlers/
│   │       └── index.ts
│   │
│   └── shared/
│       └── src/
│           ├── types/
│           ├── constants/
│           ├── events/
│           └── schemas/
│
├── assets-source/
│   ├── blender/
│   ├── references/
│   └── exports/
│
├── docs/
│   ├── REQUIREMENTS.md
│   ├── ARCHITECTURE.md
│   ├── ASSET_PIPELINE.md
│   ├── MULTIPLAYER_PROTOCOL.md
│   └── IMPLEMENTATION_PLAN.md
│
└── package.json

6. 3D Asset Pipeline

6.1. Blender and GLB/glTF

Không yêu cầu người dùng phải có máy mạnh để trực tiếp dựng toàn bộ scene trong Blender.

AI có thể hỗ trợ:

Tạo Blender Python scripts.

Dựng procedural geometry.

Tạo vật liệu và ánh sáng.

Sắp xếp nội thất.

Thiết lập camera.

Tạo scene.

Export GLB/glTF.

Có thể sử dụng một môi trường Blender chạy trên sandbox/cloud computer.

Quy trình:

AI đọc reference images.

AI tạo asset specifications.

AI viết Blender Python scripts.

Script chạy trong Blender environment.

Export thành GLB.

Download GLB về project.

Three.js load model thông qua GLTFLoader.

Kiểm tra scale, materials, lighting và performance.

Lưu ý: Sandbox có thể dựng và xuất model mà không cần máy local mạnh, nhưng chất lượng model vẫn cần kiểm tra và chỉnh sửa. Không mặc định mọi asset do AI sinh ra đều đạt production quality.

6.2. Asset Standards

Format: GLB.

Coordinate system: Y-up.

Unit: meters.

Texture: ưu tiên tối ưu kích thước.

Mesh: hạn chế polygon không cần thiết.

Materials: ưu tiên PBR.

Texture formats: WebP/KTX2 khi phù hợp.

Reuse modular assets.

Không duplicate geometry không cần thiết.

6.3. Asset Groups

Environment:

Office floor.

Walls.

Ceiling.

Windows.

Doors.

Lighting.

Furniture:

Desk.

Chair.

Sofa.

Cabinets.

Shelves.

Equipment:

Computer.

Monitor.

Keyboard.

Mouse.

TV.

Coffee machine.

Water dispenser.

Characters:

Avatar models.

Idle animation.

Walk animation.

Sit animation.

Work animation.

Drink animation.

7. TV Rendering Architecture

7.1. Selected Solution: CSS3DRenderer

Sử dụng:

Three.js WebGLRenderer để render môi trường.

CSS3DRenderer để render HTML element trong không gian 3D.

CSS3DObject để gắn YouTube iframe lên TV.

TV structure:

TV Group
│
├── TV Frame (Three.js Mesh)
│
├── Screen Border (Three.js Mesh)
│
└── Screen Display (CSS3DObject)
    │
    └── YouTube IFrame Player

Ưu điểm:

Hiển thị iframe trực tiếp.

Không phải giải mã video rồi chuyển thành texture.

Dễ tích hợp YouTube IFrame Player API.

Có thể đặt TV đúng vị trí và góc xoay trong văn phòng.

Phù hợp prototype.

Trade-offs:

CSS3DRenderer không sử dụng Three.js material system.

DOM video không trở thành WebGL texture.

Cần quản lý hai renderer.

Cần kiểm tra depth/occlusion giữa CSS và WebGL.

Không nên phụ thuộc vào CSS3D cho mọi loại UI.

TV là một HTML surface nằm trong không gian 3D, không phải màn hình có video texture thật.

8. Hosting & Deployment Architecture

8.1. Frontend Hosting

Các lựa chọn:

Cloudflare Pages

Host React + Vite.

Phân phối static assets.

HTTPS.

Custom domain.

CI/CD từ GitHub.

GitHub Pages

Host frontend static.

Phù hợp demo và preview.

Không host Node.js multiplayer server.

8.2. Multiplayer Server Hosting

Colyseus Node.js server cần một môi trường hỗ trợ:

Persistent process.

WebSocket connections.

Long-lived connections.

Room state.

Server-side logic.

Các lựa chọn triển khai:

Colyseus Cloud.

Fly.io.

Railway.

VPS.

Cloudflare Durable Objects là một phương án WebSocket-native khác, nhưng không đồng nghĩa với việc có thể deploy nguyên một Colyseus Node.js application lên Cloudflare Pages.

Nếu muốn sử dụng Cloudflare Workers/Durable Objects cho multiplayer, cần thiết kế một backend adapter hoặc một kiến trúc realtime riêng.

8.3. Recommended Prototype Deployment

              GitHub Repository
                      |
                 CI / Build
                      |
              Cloudflare Pages
                      |
               React + Three.js
                      |
              WebSocket Connection
                      |
             Colyseus Node.js Server
                      |
                 Office Room
                      |
                3-10 Players

Frontend và multiplayer backend deploy độc lập.

Cấu hình môi trường:

VITE_API_URL=https://api.example.com
VITE_WS_URL=wss://multiplayer.example.com

Không hardcode server URLs trong source code.