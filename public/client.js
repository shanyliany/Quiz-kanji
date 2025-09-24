const socket = io("https://quiz-be-7m6u.onrender.com");
const joinBox = document.getElementById('joinBox');
const lobby = document.getElementById('lobby');
const joinBtn = document.getElementById('joinBtn');
const nickIn = document.getElementById('nick');
const codeIn = document.getElementById('code');
const msg = document.getElementById('msg');
const playersDiv = document.getElementById('players');
const questionBox = document.getElementById('questionBox');
const qPrompt = document.getElementById('qPrompt');
const choicesDiv = document.getElementById('choices');
const timerP = document.getElementById('timer');
const resultDiv = document.getElementById('result');
const scoreboardDiv = document.getElementById('scoreboard');

let myCode = null;
let myNick = null;
let answered = false;
let timerInterval = null;
let myAnswers = [];

joinBtn.onclick = ()=> {
  const nick = nickIn.value.trim();
  const code = codeIn.value.trim().toUpperCase();
  if(!nick || !code) { msg.innerText = 'Fill both fields'; return; }
  socket.emit('joinRoom', {code, nick}, (res)=> {
    if(!res || !res.ok) { msg.innerText = res.error || 'Failed to join'; return; }
    myCode = code; myNick = nick;
    joinBox.classList.add('hidden');
    lobby.classList.remove('hidden');
    msg.innerText = '';
  });
};

socket.on('players', list => {
  scoreboardDiv.innerHTML = '<h3>Scoreboard</h3>' + list.map(p=>`<div>${p.nick}: ${p.score}</div>`).join('');
});

socket.on('gameStarted', ()=> {
  resultDiv.innerHTML = '';
  questionBox.classList.remove('hidden');
});

socket.on('question', q => {
  answered = false;
  qPrompt.innerText = q.prompt;
  choicesDiv.innerHTML = '';
  q.choices.forEach((c, idx)=> {
    const b = document.createElement('button');
    b.innerText = c;
    b.onclick = ()=> {
      if(answered) return;
      answered = true;
      socket.emit('answer', {code: myCode, choice: idx});
      resultDiv.innerHTML = 'Answer submitted...';
    };
    choicesDiv.appendChild(b);
  });
  // timer
  let t = q.time || 45;
  timerP.innerText = 'Time: ' + t;
  clearInterval(timerInterval);
  timerInterval = setInterval(()=> {
    t--;
    timerP.innerText = 'Time: ' + t;
    if(t<=0) clearInterval(timerInterval);
  }, 500);
});

socket.on('revealAnswer', r => {
  resultDiv.innerText = 'Answer: ' + r.correctAnswer;
  clearInterval(timerInterval);   // ✅ stop timer ketika jawaban sudah di-reveal
});

socket.on('gameEnded', data => {
  questionBox.classList.add('hidden');
  let me = data.scores.find(s => s.nick === myNick);

  if (me) {
    let answerSummary = myAnswers.map(a => `
      <div>
        <p><b>Soal ${a.number}:</b> ${a.question}</p>
        <p>Jawaban kamu: ${a.choice}</p>
        <p>Jawaban benar: ${a.correctAnswer}</p>
        <p>${a.isCorrect ? '✅ Benar' : '❌ Salah'}</p>
      </div>
    `).join('');

    resultDiv.innerHTML = `
      <h3>Game Over</h3>
      <p>Total Benar: ${me.correct}</p>
      <p>Total Salah: ${me.wrong}</p>
      <hr>
      <h4>Ringkasan Jawaban Kamu:</h4>
      ${answerSummary}
    `;
  } else {
    resultDiv.innerHTML = '<h3>Game Over</h3><p>Data tidak ditemukan.</p>';
  }
});

socket.on('myAnswerResult', data => {
  // Simpan ke myAnswers untuk ringkasan di akhir
  myAnswers.push({
    number: data.number,
    question: data.question,
    choice: data.choice,
    correctAnswer: data.correctAnswer,
    isCorrect: data.isCorrect
  });

  resultDiv.innerHTML = `
    <p>Soal ${data.number}: ${data.question}</p>
    <p>Jawaban kamu: ${data.choice}</p>
    <p>Jawaban benar: ${data.correctAnswer}</p>
    <p>${data.isCorrect ? '✅ Benar' : '❌ Salah'}</p>
  `;
});

