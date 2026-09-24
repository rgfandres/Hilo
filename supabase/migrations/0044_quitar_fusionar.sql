-- 0044 · Se retira «fusionar clientes»: en tiendas con una ficha por encargo, la misma persona
-- tiene varias fichas a propósito. Se mantiene borrar_cliente (solo fichas sin encargos).
drop function if exists fusionar_clientes(uuid, uuid);

select 'ok 0044' as r;
