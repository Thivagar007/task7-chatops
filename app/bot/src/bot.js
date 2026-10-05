// Bot Framework activity handler: Teams / Web Chat messages -> agent -> reply
const { ActivityHandler, MessageFactory, TurnContext } = require("botbuilder");

class ChatOpsBot extends ActivityHandler {
  constructor(agent) {
    super();
    this.onMessage(async (context, next) => {
      // In Teams channels the bot is @mentioned - strip the mention text
      const text = (TurnContext.removeRecipientMention(context.activity) || context.activity.text || "").trim();
      if (!text) return next();
      await context.sendActivity({ type: "typing" });

      const result = await agent.handle({
        userId: context.activity.from?.aadObjectId || context.activity.from?.id,
        conversationId: context.activity.conversation.id, // memory key = Teams conversation ID
        text,
        channel: context.activity.channelId,
      });
      await context.sendActivity(MessageFactory.text(result.reply));
      await next();
    });

    this.onMembersAdded(async (context, next) => {
      for (const m of context.activity.membersAdded || []) {
        if (m.id !== context.activity.recipient.id) {
          await context.sendActivity(
            "Hi, I'm **OpsBot** 👋 Ask me about pipeline status, active alerts, deployment history, or to roll back an app."
          );
        }
      }
      await next();
    });
  }
}

module.exports = { ChatOpsBot };
