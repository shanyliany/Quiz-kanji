const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

let rooms = {}; // roomCode -> {adminId, players: {socketId: {nick,score,answered}}, questions, current, started, answersCount, timer}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function makeRoomCode() {
  return Math.random().toString(36).slice(2,7).toUpperCase();
}

function buildSummary(room) {
  return Object.values(room.players).map(p => ({
    nick: p.nick,
    correct: p.correct || 0,
    wrong: p.wrong || 0,
    score: p.score,
    answers: p.answers || []   // ⬅️ include riwayat
  }));
}

io.on('connection', socket => {
  console.log('socket connected', socket.id);

  socket.on("createRoom", ({ level }, cb) => {
  try {
    const filePath = path.join(__dirname, "questions", `questions_lv${level}.json`);
    const raw = fs.readFileSync(filePath, "utf8");
    const QUESTIONS = JSON.parse(raw);

    let code = makeRoomCode();
    rooms[code] = {
  adminId: socket.id,
  players: {},
  questions: shuffle(QUESTIONS),  // ⬅️ acak dulu
  current: -1,
  started: false,
  answersCount: 0,
  timers: {}
};

    socket.join(code);
    socket.emit("roomCreated", code);
    cb && cb({ ok: true, code });
  } catch (err) {
    cb && cb({ ok: false, error: "Level file not found" });
  }
});

  socket.on('joinRoom', ({code, nick}, cb) => {
    const room = rooms[code];
    if(!room) return cb && cb({ok:false, error:'Room not found'});
    room.players[socket.id] = {
      nick,
      score: 0,
      answered: false,
      correct: 0,
      wrong: 0
    };
    socket.join(code);
    io.to(code).emit('players', Object.values(room.players).map(p=>({nick:p.nick, score:p.score})));
    cb && cb({ok:true});
  });

  socket.on('startGame', ({code}, cb) => {
    const room = rooms[code];
    if(!room) return cb && cb({ok:false});
    if(socket.id !== room.adminId) return cb && cb({ok:false, error:'not admin'});
    room.started = true;
    room.current = -1;
    io.to(code).emit('gameStarted');
    nextQuestion(code);
    cb && cb({ok:true});
  });

  socket.on('answer', ({code, choice}, cb) => {
    const room = rooms[code];
    if(!room) return;
    const q = room.questions[room.current];
    if(!q) return;
    const player = room.players[socket.id];
    if(!player || player.answered) return;
    player.answered = true;
    room.answersCount++;
    let correct = (choice === q.answer);
    if (correct) {
      player.score += 100;
      player.correct += 1;
    } else {
      player.wrong += 1;
    }
    if (!player.answers) player.answers = [];

    player.answers.push({
  number: room.current + 1,             // simpan nomor soal
  question: q.prompt,                   // teks soal
  choice: q.choices[choice],            // jawaban user
  correctAnswer: q.choices[q.answer],   // kunci jawaban
  isCorrect: correct
});
    
    socket.emit('answerResult', {correct, correctAnswer: q.answer});
    // update scoreboard
    io.to(code).emit('players', Object.values(room.players).map(p=>({nick:p.nick, score:p.score})));
    // check if all answered
    if (room.answersCount >= Object.keys(room.players).length) {
  clearTimeout(room.timers[room.current]);
  // langsung reveal jawaban lalu next question
  io.to(code).emit('revealAnswer', { correctAnswer: q.answer });
  setTimeout(() => nextQuestion(code), 2000);
}
    cb && cb({ok:true});
  });

  socket.on('endGame', ({code}, cb) => {
  const room = rooms[code];
  if (!room) return cb && cb({ok:false});
  if (socket.id !== room.adminId) return cb && cb({ok:false, error:'not admin'});

  io.to(room.adminId).emit('gameEnded', { scores: buildSummary(room) }); // ⬅️ kirim hanya ke admin

  delete rooms[code];
  cb && cb({ok:true});
});



  socket.on('nextQuestion', ({code}, cb) => {
    nextQuestion(code);
    cb && cb({ok:true});
  });

  socket.on('disconnect', () => {
    // remove from rooms
    for(const code of Object.keys(rooms)) {
      const room = rooms[code];
      if(room.players[socket.id]) {
        delete room.players[socket.id];
        io.to(code).emit('players', Object.values(room.players).map(p=>({nick:p.nick, score:p.score})));
      }
      if(room.adminId === socket.id) {
        // end room
        io.to(code).emit('gameEnded', {reason: 'admin disconnected'});
        delete rooms[code];
      }
    }
  });
});

function nextQuestion(code) {
  const room = rooms[code];
  if(!room) return;
  room.current++;
  room.answersCount = 0;
  if (room.current >= room.questions.length) {
  io.to(room.adminId).emit('gameEnded', { scores: buildSummary(room) });
  // jangan delete dulu
  return;
}
  // reset answered flags
  Object.values(room.players).forEach(p => p.answered = false);
room.answersCount = 0; // reset count setiap soal baru

const q = room.questions[room.current];

// kirim soal tanpa kunci
io.to(code).emit('question', {
  index: room.current,
  prompt: q.prompt,
  choices: q.choices,
  time: 45
});

// kasih timer jaga-jaga kalau ada yang nggak jawab
room.timers[room.current] = setTimeout(() => {
  io.to(code).emit('revealAnswer', { correctAnswer: q.answer });
  setTimeout(() => nextQuestion(code), 500);
}, 45000);
}

http.listen(PORT, ()=> console.log('Server running on', PORT));