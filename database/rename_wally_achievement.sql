START TRANSACTION;

UPDATE logros
SET titulo = '¿Dónde está Wally?'
WHERE clave = 'donde_esta_wally';

SELECT ROW_COUNT() AS logros_actualizados;

COMMIT;
