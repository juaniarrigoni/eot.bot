import { config } from 'dotenv';
import { join } from 'path';
import { addKeyword, EVENTS, utils, createFlow, createProvider, MemoryDB, createBot } from '@builderbot/bot';
import { toAsk } from '@builderbot-plugins/openai-assistants';
import { MetaProvider } from '@builderbot/provider-meta';

const typing = async function (ctx, provider) {
    if (provider && provider?.vendor && provider.vendor?.sendPresenceUpdate) {
        const id = ctx.key.remoteJid;
        await provider.vendor.sendPresenceUpdate("composing", id);
    }
};

config();
const PORT = process.env.PORT ?? 3000;
process.env.TWILIO_ACCOUNT_SID;
process.env.TWILIO_AUTH_TOKEN;
process.env.NUMBER;
const JWT_TOKEN = process.env.JWT_TOKEN;
const NUMBER_ID = process.env.NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
console.log(JWT_TOKEN, NUMBER_ID, VERIFY_TOKEN);
addKeyword("doc").addAnswer([
    "You can see the documentation here",
    "📄 https://builderbot.app/docs \n",
    "Do you want to continue? *yes*",
].join("\n"), { capture: true }, async (ctx, { gotoFlow, flowDynamic }) => {
    if (ctx.body.toLocaleLowerCase().includes("yes")) {
        return gotoFlow(registerFlow);
    }
    await flowDynamic("Thanks!");
    return;
});
const welcomeFlow = addKeyword(EVENTS.WELCOME)
    .addAnswer("⚡")
    .addAction(async (ctx, { flowDynamic, state, provider }) => {
    console.log("entro");
    await typing(ctx, provider);
    const response = await toAsk(process.env.ASSISTANT_ID, ctx.body, state);
    const chunks = response.split(/(?<!\d)\.\s+/g);
    for (const chunk of chunks) {
        await flowDynamic([{ body: chunk.trim() }]);
    }
});
const registerFlow = addKeyword(utils.setEvent("REGISTER_FLOW"))
    .addAnswer(`What is your name?`, { capture: true }, async (ctx, { state }) => {
    await state.update({ name: ctx.body });
})
    .addAnswer("What is your age?", { capture: true }, async (ctx, { state }) => {
    await state.update({ age: ctx.body });
})
    .addAction(async (_, { flowDynamic, state }) => {
    await flowDynamic(`${state.get("name")}, thanks for your information!: Your age: ${state.get("age")}`);
});
const fullSamplesFlow = addKeyword([
    "samples",
    utils.setEvent("SAMPLES"),
])
    .addAnswer(`💪 I'll send you a lot files...`)
    .addAnswer(`Send image from Local`, {
    media: join(process.cwd(), "assets", "sample.png"),
})
    .addAnswer(`Send video from URL`, {
    media: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTJ0ZGdjd2syeXAwMjQ4aWdkcW04OWlqcXI3Ynh1ODkwZ25zZWZ1dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/LCohAb657pSdHv0Q5h/giphy.mp4",
})
    .addAnswer(`Send audio from URL`, {
    media: "https://cdn.freesound.org/previews/728/728142_11861866-lq.mp3",
})
    .addAnswer(`Send file from URL`, {
    media: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
});
const main = async () => {
    const adapterFlow = createFlow([welcomeFlow, registerFlow, fullSamplesFlow]);
    const adapterProvider = createProvider(MetaProvider, {
        jwtToken: JWT_TOKEN,
        numberId: NUMBER_ID,
        verifyToken: VERIFY_TOKEN,
        version: "v19.0",
    });
    const adapterDB = new MemoryDB();
    const { handleCtx, httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    });
    adapterProvider.server.post("/v1/messages", handleCtx(async (bot, req, res) => {
        const { number, message, urlMedia } = req.body;
        await bot.sendMessage(number, message, { media: urlMedia ?? null });
        return res.end("sended");
    }));
    adapterProvider.server.post("/v1/register", handleCtx(async (bot, req, res) => {
        const { number, name } = req.body;
        await bot.dispatch("REGISTER_FLOW", { from: number, name });
        return res.end("trigger");
    }));
    adapterProvider.server.post("/v1/samples", handleCtx(async (bot, req, res) => {
        const { number, name } = req.body;
        await bot.dispatch("SAMPLES", { from: number, name });
        return res.end("trigger");
    }));
    adapterProvider.server.post("/v1/blacklist", handleCtx(async (bot, req, res) => {
        const { number, intent } = req.body;
        if (intent === "remove")
            bot.blacklist.remove(number);
        if (intent === "add")
            bot.blacklist.add(number);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ status: "ok", number, intent }));
    }));
    httpServer(+PORT);
};
main();
