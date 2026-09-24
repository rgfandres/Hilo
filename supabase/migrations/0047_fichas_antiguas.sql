-- 0047 · Plantillas de ficha en el formato antiguo ({{…}}, {{#each}}) de los datos de ejemplo:
-- no se entienden y la ficha salía como código. Se quitan y esas tiendas usan la de por defecto.
delete from plantilla_ficha where html like '%{{%';
update periodo set ajustes = ajustes - 'ficha' where coalesce(ajustes->>'ficha', '') like '%{{%';

select 'ok 0047' as r;
