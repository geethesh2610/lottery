import { useEffect, useState } from 'react';
import { useAsync } from './useAsync.js';
import { listLotteries, listPrizeCategories, loadEntries } from '../services/resultsService.js';
import { DEFAULT_PRIZE } from '../constants/prizes.js';

/** Lottery + prize selection state with options loaded from the database. */
export function useLotterySelection() {
  const lotteries = useAsync(() => listLotteries(), []);
  const [lottery, setLottery] = useState('');
  const [prize, setPrize] = useState(DEFAULT_PRIZE);
  const prizes = useAsync(() => (lottery ? listPrizeCategories(lottery) : Promise.resolve([])), [lottery]);

  useEffect(() => {
    if (!lottery && lotteries.data?.length) setLottery(lotteries.data[0].lottery_name);
  }, [lotteries.data, lottery]);

  useEffect(() => {
    const list = prizes.data || [];
    if (list.length && !list.some((p) => p.prize_category === prize)) setPrize(list[0].prize_category);
  }, [prizes.data, prize]);

  return {
    lottery,
    setLottery,
    prize,
    setPrize,
    lotteryOptions: (lotteries.data || []).map((l) => l.lottery_name),
    prizeOptions: (prizes.data || []).map((p) => p.prize_category),
    loading: lotteries.loading,
    error: lotteries.error || prizes.error,
  };
}

/** Loads { draw_date, number } entries for a lottery + prize. */
export function useEntries(lottery, prize) {
  return useAsync(() => loadEntries(lottery, prize), [lottery, prize], { enabled: !!lottery && !!prize });
}
