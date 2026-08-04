-- QA lane: promote the internal QA test account to a paid plan so preview/console
-- can be verified end-to-end on the paid model lane.
UPDATE public.user_settings
   SET plan = 'growth', credits_total = 300, period_start = current_date
 WHERE user_id = '474d02ea-d47e-4680-a703-ae1d62db06cc';

UPDATE public.profiles
   SET plan = 'growth'
 WHERE id = '474d02ea-d47e-4680-a703-ae1d62db06cc';