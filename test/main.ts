import assert from 'assert';
import autocannon from 'autocannon';
import { writeFileSync } from 'fs-extra';
import * as supertest from 'supertest';

const Root = {
    username: 'root',
    password: '123456',
    creditionals: null,
};

describe('App', () => {
    let agent: supertest.SuperAgentTest;
    before('init', function init(done) {
        this.timeout(30000);
        let timeout;
        const resolve = () => setTimeout(() => {
            clearTimeout(timeout);
            agent = supertest.agent(require('hydrooj').httpServer);
            done();
        }, 2000);
        process.send = ((send) => (data) => {
            if (data === 'ready') resolve();
            return send?.(data) || false;
        })(process.send);
        timeout = setTimeout(resolve, 20000);
    });

    const routes = ['/', '/api', '/p', '/contest', '/homework', '/user/1', '/training'];
    routes.forEach((route) => it(`GET ${route}`, () => agent.get(route).expect(200)));

    it('API user', async () => {
        await agent.get('/api?{user(id:1){uname}}').expect({ data: { user: { uname: 'Hydro' } } });
        await agent.get('/api?{user(id:2){uname}}').expect({ data: { user: null } });
    });

    it('Create User', async () => {
        const redirect = await agent.post('/register')
            .send({ mail: 'test@example.com' })
            .expect(302)
            .then((res) => res.headers.location);
        await agent.post(redirect)
            .send({ uname: Root.username, password: Root.password, verifyPassword: Root.password })
            .expect(302);
    });

    it('Login', async () => {
        const cookie = await agent.post('/login')
            .send({ uname: Root.username, password: Root.password })
            .expect(302)
            .then((res) => res.headers['set-cookie']);
        Root.creditionals = cookie;
    });

    it('API registered user', async () => {
        await agent.get('/api?{user(id:2){uname}}').expect({ data: { user: { uname: 'root' } } });
    });

    // TODO add more tests

    const results: Record<string, autocannon.Result> = {};
    if (process.env.BENCHMARK) {
        routes.forEach((route) => it(`Performance test ${route}`, async function test() {
            this.timeout(60000);
            await global.Hydro.model.system.set('limit.global', 99999);
            const result = await autocannon({ url: `http://localhost:8888${route}` });
            assert(result.errors === 0, `test ${route} returns errors`);
            results[route] = result;
        }));
    }

    after(() => {
        const metrics = Object.entries(([k, v]) => ({
            name: `Benchmark - ${k} - Req/sec`,
            unit: 'Req/sec',
            value: v.requests.average,
        }));
        writeFileSync('./benchmark.json', JSON.stringify(metrics, null, 2));
        setTimeout(() => process.exit(0), 1000);
    });
});
