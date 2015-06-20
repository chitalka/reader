module.exports = function (bt) {
   bt.setDefaultView('spin', 'default');

   bt.match('spin_default*', function (ctx) {
      ctx.setState('progressed');
   });
};
