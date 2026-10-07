const todayStart = new Date();
todayStart.setUTCHours(0, 0, 0, 0);

const firstLogDate = new Date();
firstLogDate.setUTCDate(firstLogDate.getUTCDate() - 10);
firstLogDate.setUTCHours(0, 0, 0, 0);

const msPerDay = 24 * 60 * 60 * 1000;
const totalDaysHistory = Math.floor((todayStart.getTime() - firstLogDate.getTime()) / msPerDay);
const fullDaysAvailable = Math.min(30, totalDaysHistory);

console.log(fullDaysAvailable);
