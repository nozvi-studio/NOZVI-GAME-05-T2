import { createHealthServer } from './health';

const port = Number(process.env.PORT ?? 2567);
createHealthServer().listen(port, () => console.log(`server listening on ${port}`));
