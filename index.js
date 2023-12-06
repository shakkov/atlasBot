require('dotenv').config();
const { Bot, GrammyError, HttpError, Keyboard, session } = require('grammy');
const moment = require('moment');

const axios = require('axios').default;

function initial() {
  return { step: 'city', date: '', time: '', time2: '', arrivalCity: '', destinationCity: '' };
}

const bot = new Bot(process.env.BOT_API_KEY);

bot.use(session({ initial }));

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error('Error in request:', e.description);
  } else if (e instanceof HttpError) {
    console.error('Could not contact Telegram:', e);
  } else {
    console.error('Unknown error:', e);
  }
});

const search = async (ctx) => {
  await ctx.reply(
    `Ищем билеты на ${ctx.session.date} c ${ctx.session.time1} по ${ctx.session.time2}`,
  );

  const res = await axios.get(
    `https://atlasbus.by/api/search?from_id=${ctx.session.arrivalCity}&to_id=${ctx.session.destinationCity}&calendar_width=30&date=${ctx.session.date}&passengers=1`,
  );

  const freeSeats = res.data.rides.filter(
    (element) =>
      element.freeSeats !== 0 &&
      moment(moment(element.departure).format('HH:mm'), 'HH:mm').isBetween(
        moment(ctx.session.time1, 'HH:mm'),
        moment(ctx.session.time2, 'HH:mm'),
      ),
  );

  await ctx.reply(`Найдено ${freeSeats.length} поездок`);

  const notUndefined = (anyValue) => typeof anyValue !== 'undefined';

  const timeSlots = await res.data.rides
    .map((element) => {
      if (
        element.freeSeats !== 0 &&
        moment(moment(element.departure).format('HH:mm'), 'HH:mm').isBetween(
          moment(ctx.session.time1, 'HH:mm'),
          moment(ctx.session.time2, 'HH:mm'),
        )
      ) {
        return `${moment(element.departure).format('HH:mm')}, свободно мест: ${
          element.freeSeats
        }\n`;
      }
    })
    .filter(notUndefined);
  if (timeSlots.length > 0) {
    await ctx.reply(timeSlots.join(''));
  }

  return timeSlots.length;
};

bot.command('start', async (ctx) => {
  const startKeyboard = new Keyboard().text('Назад').resized();
  ctx.session.step = 'city';

  await ctx.reply('Привет! \nЯ бот для поиска билетов');
  await ctx.reply('Введи город назначения', { reply_markup: startKeyboard });
});

bot.on(':text', async (ctx) => {
  if (ctx.session.step === 'city') {
    if (ctx.message.text.toLowerCase() == 'минск') {
      ctx.session.destinationCity = 'c625144';
      ctx.session.arrivalCity = 'c625665';
      await ctx.reply('Едем из Могилева в Минск');
      ctx.session.step = 'date';
      await ctx.reply('Введи дату поездки в формате ДД.MM.ГГГГ');
    } else if (ctx.message.text.toLowerCase() == 'могилев') {
      ctx.session.destinationCity = 'c625665';
      ctx.session.arrivalCity = 'c625144';
      await ctx.reply('Едем из Минска в Могилев');
      ctx.session.step = 'date';
      await ctx.reply('Введи дату поездки в формате ДД.MM.ГГГГ');
    } else {
      if (ctx.message.text === 'Назад') {
        const startKeyboard = new Keyboard().text('Назад').resized();
        ctx.session.step = 'city';

        await ctx.reply('Введи город назначения', { reply_markup: startKeyboard });
      }
    }
  } else if (ctx.session.step === 'date') {
    if (moment(ctx.message.text, 'DD.MM.YYYY').isValid()) {
      ctx.session.date = moment(ctx.message.text, 'DD.MM.YYYY').format('YYYY-MM-DD');

      ctx.session.step = 'time1';

      await ctx.reply('введи время отправления 1 (например, 9)');
    } else {
      if (ctx.message.text === 'Назад') {
        const startKeyboard = new Keyboard().text('Назад').resized();
        ctx.session.step = 'city';

        await ctx.reply('Введи город назначения', { reply_markup: startKeyboard });
      } else {
        await ctx.reply('Неверный формат даты');
        await ctx.reply('Введи дату поездки в формате ДД.MM.ГГГГ');
      }
    }
  } else if (ctx.session.step === 'time1') {
    if (moment(ctx.message.text, 'HH:mm').isValid()) {
      ctx.session.time1 = moment(ctx.message.text, 'HH:mm').format('HH:mm');

      ctx.session.step = 'time2';

      await ctx.reply('введи время отправления 2(например, 12)');
    } else {
      if (ctx.message.text === 'Назад') {
        const startKeyboard = new Keyboard().text('Назад').resized();
        ctx.session.step = 'date';

        await ctx.reply('Введи дату поездки в формате ДД.MM.ГГГГ', { reply_markup: startKeyboard });
      } else {
        await ctx.reply('Неверный формат времени');
        await ctx.reply('Введи время отправления 1(например, 9)');
      }
    }
  } else if (ctx.session.step === 'time2') {
    if (
      moment(ctx.message.text, 'HH:mm').isValid() &&
      moment(ctx.message.text, 'HH:mm').isAfter(moment(ctx.session.time1, 'HH:mm'))
    ) {
      ctx.session.time2 = moment(ctx.message.text, 'HH:mm').format('HH:mm');

      let searchRes = await search(ctx);

      if (searchRes == 0) {
        ctx.reply('Усердно ищу каждую минуту, чтобы отменить - попробуй нажать назад. Может поможет');
        const intervalId = setInterval(async () => {
          searchRes = await search(ctx);
          console.log(searchRes, 'searchRes');

          if (searchRes !== 0 || ctx.session.step !== 'time2') {
            clearInterval(intervalId);
          }
        }, 60000);
      } else {
        await ctx.reply('Введи город назначения');
        ctx.session.step = 'city';
      }
     
    } else {
      if (ctx.message.text === 'Назад') {
        ctx.session.step = 'time1';
        await ctx.reply('Введи время отправления 1(например, 9)');
      } else {
        await ctx.reply('Неверный формат времени');
        await ctx.reply('Введи время отправления 2 (например, 12)');
      }
    }
  }
});

bot.start();
