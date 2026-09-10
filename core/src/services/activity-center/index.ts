export {};
/**
 * 活动中心 - barrel re-export。
 */

const weatherActivityService = require('../weather-activity');
const snapshot = require('./snapshot');
const season = require('./season');
const shop = require('./shop');
const constellation = require('./constellation');
const qingMei = require('./qingmei');
const qixi = require('./qixi');
const charity = require('./charity');
const petDiary = require('./pet-diary-runtime');

module.exports = {
    getPetDiary: petDiary.getPetDiary,
    operatePetDiary: petDiary.operatePetDiary,
    getPetDiaryRecords: petDiary.getPetDiaryRecords,
    getPetDiaryFriend: petDiary.getPetDiaryFriend,
    buildActivityDirectory: snapshot.buildActivityDirectory,
    getActivityDirectorySnapshot: snapshot.getActivityDirectorySnapshot,
    getActivityCenterSnapshot: snapshot.getActivityCenterSnapshot,
    getCurrentSeasonEvent: snapshot.getCurrentSeasonEvent,
    getCurrentStellarActivity: snapshot.getCurrentStellarActivity,
    getCurrentStarSandShop: snapshot.getCurrentStarSandShop,
    getCurrentSolarTerms: snapshot.getCurrentSolarTerms,
    getCurrentQixiActivity: qixi.getCurrentQixiActivity,
    getCurrentCharityRedFlowerActivity: charity.getCurrentCharityRedFlowerActivity,
    acceptCharityRedFlowerAgreement: charity.acceptCharityRedFlowerAgreement,
    getCurrentWeatherActivity: weatherActivityService.getCurrentWeatherActivity,
    getWeatherFriends: weatherActivityService.getWeatherFriends,
    buyWeatherBottle: weatherActivityService.exchangeWeatherCollectorBottle,
    collectWeatherBottle: weatherActivityService.useWeatherCollectorBottle,
    lightWeatherResearch: weatherActivityService.advanceWeatherResearch,
    summonWeatherRain: weatherActivityService.useWeatherSummonBottle,
    exchangeWeatherCollectorBottle: weatherActivityService.exchangeWeatherCollectorBottle,
    scanWeatherFriends: weatherActivityService.scanWeatherFriends,
    useWeatherCollectorBottle: weatherActivityService.useWeatherCollectorBottle,
    useWeatherSummonBottle: weatherActivityService.useWeatherSummonBottle,
    useWeatherFrogBottle: weatherActivityService.useWeatherFrogBottle,
    useWeatherCloudBottle: weatherActivityService.useWeatherCloudBottle,
    advanceWeatherResearch: weatherActivityService.advanceWeatherResearch,
    claimBattlePassRewards: season.claimBattlePassRewards,
    exchangeStarSandGoods: shop.exchangeStarSandGoods,
    lightConstellation: constellation.lightConstellation,
    claimSolarTerm: season.claimSolarTerm,
    getCurrentQingMeiActivity: qingMei.getCurrentQingMeiActivity,
    claimQingMeiDailySeed: qingMei.claimQingMeiDailySeed,
    startQingMeiBrew: qingMei.startQingMeiBrew,
    continueQingMeiBrew: qingMei.continueQingMeiBrew,
    settleQingMeiBrew: qingMei.settleQingMeiBrew,
    claimQixiBridgeRewards: qixi.claimQixiBridgeRewards,
    giftQixiSachet: qixi.giftQixiSachet,
    claimCharityRedFlowerSeeds: charity.claimCharityRedFlowerSeeds,
    shareCharityRedFlower: charity.shareCharityRedFlower,
    donateCharityRedFlowerLove: charity.donateCharityRedFlowerLove,
    claimCharityRedFlowerProgressReward: charity.claimCharityRedFlowerProgressReward,
    claimCharityRedFlowerDailyGift: charity.claimCharityRedFlowerDailyGift,
};
